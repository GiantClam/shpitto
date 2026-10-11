import fs from 'fs/promises';
import path from 'path';

const MEMORY_DIR = path.join(process.cwd(), '.agent_memory');

/**
 * Manus-style Persistence Utils
 * These functions help the agent maintain "working memory" on disk.
 */

export async function writeToMemory(filename: string, content: string) {
    try {
        const filePath = path.join(MEMORY_DIR, filename);
        await fs.mkdir(MEMORY_DIR, { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        console.log(`[Agent Memory] Persisted: ${filename}`);
    } catch (error) {
        console.error(`[Agent Memory] Failed to write to ${filename}:`, error);
    }
}

export async function readFromMemory(filename: string): Promise<string | null> {
    try {
        const filePath = path.join(MEMORY_DIR, filename);
        return await fs.readFile(filePath, 'utf8');
    } catch (error) {
        return null;
    }
}

export async function appendToMemory(filename: string, content: string) {
    try {
        const filePath = path.join(MEMORY_DIR, filename);
        await fs.mkdir(MEMORY_DIR, { recursive: true });
        await fs.appendFile(filePath, `\n--- ${new Date().toISOString()} ---\n${content}`, 'utf8');
    } catch (error) {
        console.error(`[Agent Memory] Failed to append to ${filename}:`, error);
    }
}

/**
 * Specific helper to update the task plan
 */
export async function updateTaskPlan(plan: string) {
    const template = `# Task Plan - Industry Website Generation\n\nLast Updated: ${new Date().toLocaleString()}\n\n${plan}`;
    await writeToMemory('task_plan.md', template);
}

/**
 * Specific helper to log findings or errors for self-correction
 */
export async function logLinterFinding(error: string, attempt: number) {
    const finding = `## Attempt ${attempt} Failure\n- Error: ${error}\n- Recommendation: Adjust schema nesting or check component props.`;
    await appendToMemory('findings.md', finding);
}
