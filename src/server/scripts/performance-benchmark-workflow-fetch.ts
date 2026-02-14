
import { performance } from 'perf_hooks';

// Simulating the WorkflowModel to avoid DB dependencies in this benchmark script
// and to explicitly control latency for demonstration purposes.
class MockWorkflowModel {
  private workflows: Map<string, any>;
  private latencyMs: number;

  constructor(count: number, latencyMs: number = 10) {
    this.workflows = new Map();
    this.latencyMs = latencyMs;
    for (let i = 0; i < count; i++) {
      const id = `wf-${i}`;
      this.workflows.set(id, { id, name: `Workflow ${i}`, steps: [] });
    }
  }

  private async simulateLatency() {
    return new Promise(resolve => setTimeout(resolve, this.latencyMs));
  }

  async findById(id: string) {
    await this.simulateLatency();
    return this.workflows.get(id);
  }

  async findByIds(ids: string[]) {
    await this.simulateLatency();
    return ids.map(id => this.workflows.get(id)).filter(Boolean);
  }
}

async function runBenchmark() {
  const WORKFLOW_COUNT = 50;
  const DB_LATENCY_MS = 5; // Conservative estimate for local DB, cloud DB would be higher
  const model = new MockWorkflowModel(WORKFLOW_COUNT, DB_LATENCY_MS);
  const ids = Array.from({ length: WORKFLOW_COUNT }, (_, i) => `wf-${i}`);

  console.log(`Starting benchmark with ${WORKFLOW_COUNT} workflows and ${DB_LATENCY_MS}ms simulated DB latency...`);

  // 1. Unoptimized: N+1 Query
  console.log('\n--- Unoptimized: N+1 Query (Looping findById) ---');
  const startUnoptimized = performance.now();
  const unoptimizedResults = [];
  for (const id of ids) {
    const doc = await model.findById(id);
    if (doc) unoptimizedResults.push(doc);
  }
  const endUnoptimized = performance.now();
  const timeUnoptimized = endUnoptimized - startUnoptimized;
  console.log(`Time taken: ${timeUnoptimized.toFixed(2)}ms`);
  console.log(`Average per item: ${(timeUnoptimized / WORKFLOW_COUNT).toFixed(2)}ms`);

  // 2. Optimized: Batch Query
  console.log('\n--- Optimized: Batch Query (findByIds) ---');
  const startOptimized = performance.now();
  const optimizedResults = await model.findByIds(ids);
  const endOptimized = performance.now();
  const timeOptimized = endOptimized - startOptimized;
  console.log(`Time taken: ${timeOptimized.toFixed(2)}ms`);

  // Results
  console.log('\n--- Results ---');
  console.log(`Improvement: ${(timeUnoptimized / timeOptimized).toFixed(1)}x faster`);
  console.log(`Time saved: ${(timeUnoptimized - timeOptimized).toFixed(2)}ms`);

  if (unoptimizedResults.length !== optimizedResults.length) {
    console.error('ERROR: Result counts do not match!');
    process.exit(1);
  }
}

runBenchmark().catch(console.error);
