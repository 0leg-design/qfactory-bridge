import { Command } from "commander";
import { sendChat } from "../../core/actions/send_chat.js";

export const chatCommand = new Command("chat")
  .description("Post a message to a task's chat thread")
  .argument("<taskId>", "Task ID")
  .requiredOption("--content <text>", "Message content")
  .option("--role <role>", "Message role: agent|user|system", "agent")
  .option("--model <name>", "Agent model name")
  .action(async (taskId: string, opts: { content: string; role: string; model?: string }) => {
    try {
      const result = await sendChat({
        taskId,
        role: opts.role as never,
        content: opts.content,
        model: opts.model,
      });
      console.log(JSON.stringify(result));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
