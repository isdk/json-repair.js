import { SchemaWalker } from './src/walker/index.js';
import { RepairParser } from './src/parser.js';

async function test() {
  const schema = {
    type: 'object',
    properties: {
      tags: { type: 'array', items: { type: 'string' } }
    }
  };
  const walker = await SchemaWalker.create(schema);
  const parser = new RepairParser(walker);
  
  const input = '{ "tags": ["a\"b"] }'; // 标准情况
  console.log('Standard:', JSON.stringify(parser.parse(input)));

  const input2 = '{ "tags": ["a"b"] }'; // 非标情况
  console.log('Broken:', JSON.stringify(parser.parse(input2)));
}

test();