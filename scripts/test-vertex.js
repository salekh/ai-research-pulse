const { VertexAI } = require('@google-cloud/vertexai');
const project = 'sa-learning-1';
const location = 'us-central1';

async function test() {
  try {
    const vertex_ai = new VertexAI({ project, location });
    console.log('VertexAI keys:', Object.keys(vertex_ai));
    if (vertex_ai.preview) {
      console.log('VertexAI.preview keys:', Object.keys(vertex_ai.preview));
    }
    
    const model = vertex_ai.preview.getGenerativeModel({ model: 'text-embedding-004' });
    console.log('Model keys:', Object.keys(model));
    console.log('Model prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(model)));

  } catch (e) {
    console.error('Error:', e);
  }
}

test();
