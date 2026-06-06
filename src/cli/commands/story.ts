import { Command } from "commander";
import { getStory } from "../../core/actions/qf.js";

export const storyCommand = new Command("story")
  .description("Show full detail of a story/task")
  .argument("<id>", "Story/Task ID")
  .action(async (id: string) => {
    try {
      const data = await getStory({ id });
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
