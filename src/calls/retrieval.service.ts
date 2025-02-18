import { Injectable } from '@nestjs/common';
import { DocumentInterface } from '@langchain/core/documents';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';

const THRESHOLD = 0.5;

@Injectable()
export class RetrievalService {
  private async getVectorStore(indexName: string) {
    const embeddings = new OpenAIEmbeddings({
      model: 'text-embedding-ada-002',
    });
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeConfig: {
        indexName: indexName,
        config: { apiKey: process.env.PINECONE_API_KEY! },
      },
      maxConcurrency: 5,
    });
    return vectorStore;
  }

  async getRetriever(indexName: string, question: string) {
    const vectorStore = await this.getVectorStore(indexName);
    const retrievedDocs = await vectorStore.similaritySearchWithScore(question);
    const processedRetrievedDocs = retrievedDocs.map(
      ([doc, score]: [DocumentInterface, number]) => {
        if (score < THRESHOLD) return null;
        const nodeContentString = doc.metadata._node_content as string;
        const nodeContent = JSON.parse(nodeContentString) as {
          text: string;
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _node_content, ...metadata } = doc.metadata;
        const retrievedDoc: DocumentInterface = {
          pageContent: nodeContent.text,
          id: doc.id,
          metadata: { ...metadata },
        };
        return retrievedDoc;
      },
    );
    return {
      context: processedRetrievedDocs.filter((doc) => doc !== null),
    };
  }
}

// Export a helper function if needed by the AzureOpenAiService.
export async function getRetriever(indexName: string, question: string) {
  const service = new RetrievalService();
  return await service.getRetriever(indexName, question);
}
