import tl = require('azure-pipelines-task-lib/task');
import { OpenAI } from 'openai';
import { AzureOpenAI } from 'openai';
import { ChatGPT } from './chatgpt';
import { Repository } from './repository';
import { PullRequest } from './pullrequest';

export class Main {
    private static _chatGpt: ChatGPT;
    private static _repository: Repository;
    private static _pullRequest: PullRequest;

    public static async Main(): Promise<void> {
        if (tl.getVariable('Build.Reason') !== 'PullRequest') {
            tl.setResult(tl.TaskResult.Skipped, "This task must only be used when triggered by a Pull Request.");
            return;
        }

        if(!tl.getVariable('System.AccessToken')) {
            tl.setResult(tl.TaskResult.Failed, "'Allow Scripts to Access OAuth Token' must be enabled. See https://learn.microsoft.com/en-us/azure/devops/pipelines/build/options?view=azure-devops#allow-scripts-to-access-the-oauth-token for more information");
            return;
        }

        // Get the input values
        const apiKey = tl.getInput('api_key', true)!;
        const apiEndpoint = tl.getInput('api_endpoint', false)!;
        const apiVersion = tl.getInput('api_version', false)!;
        const language = tl.getInput('lang', false);
        const fileExtensions = tl.getInput('file_extensions', false);
        const filesToExclude = tl.getInput('file_excludes', false);
        const additionalPrompts = tl.getInput('additional_prompts', false)?.split(',');
        const bugs = tl.getBoolInput('bugs', false);
        const performance = tl.getBoolInput('performance', false);
        const bestPractices = tl.getBoolInput('best_practices', false);
        const modifiedLinesOnly = tl.getBoolInput('modified_lines_only', false);        

        console.info(`file_extensions: ${fileExtensions}`);
        console.info(`file_excludes: ${filesToExclude}`);
        console.info(`additional_prompts: ${additionalPrompts}`);
        console.info(`bugs: ${bugs}`);
        console.info(`performance: ${performance}`);
        console.info(`best_practices: ${bestPractices}`);
        console.info(`modified_lines_only: ${modifiedLinesOnly}`);

        const client = apiEndpoint ? new AzureOpenAI({ apiKey: apiKey, endpoint: apiEndpoint, apiVersion: apiVersion }) : new OpenAI({ apiKey: apiKey });
        this._chatGpt = new ChatGPT(client, bugs, performance, bestPractices, modifiedLinesOnly, additionalPrompts, language);
        this._repository = new Repository();
        this._pullRequest = new PullRequest();
        await this._pullRequest.CheckAuthor();
        let filesToReview = await this._repository.GetChangedFiles(fileExtensions, filesToExclude);

        tl.setProgress(0, 'Performing Code Review');

        for (let index = 0; index < filesToReview.length; index++) {
            let fileName = filesToReview[index];
            let diff = await this._repository.GetDiff(fileName);

            //console.info("Diff: \r\n" + diff);

            // Get existing comments for the file
            let existingComments = await this._pullRequest.GetCommentsForFile(fileName);
            console.info("Existing comments: " + existingComments.length);

            // Perform code review with existing comments
            let reviewComment = await this._chatGpt.PerformCodeReview(diff, fileName, existingComments);

            // Add the review comments to the pull request 
            if (reviewComment) {
                for (const thread of this.prepareThreads(reviewComment as any[])) {                    
                    await this._pullRequest.AddThread(thread);
                }
            }

            console.info(`Completed review of file ${fileName}`);
            tl.setProgress((fileName.length / 100) * index, 'Performing Code Review');
        }

        tl.setResult(tl.TaskResult.Succeeded, "Pull Request reviewed.");
    }

    private static prepareThreads(data: any[]): any[] {
        const grouped = new Map<string, any>();
    
        for (const file of data) {
          for (const comment of file.comments) {
            const lineRangeKey = `${comment.lineRange.start.line},${comment.lineRange.start.column}-${comment.lineRange.end.line},${comment.lineRange.end.column}`;
            const key = `${file.filePath}:${lineRangeKey}`;
    
            if (!grouped.has(key)) {
              grouped.set(key, {
                filePath: file.filePath,
                lineRange: comment.lineRange,
                comments: [],
              });
            }
    
            grouped.get(key)!.comments.push(comment.comment);
          }
        }
    
        const result: any[] = [];
        for (const value of grouped.values()) {
          result.push({
            threads: [
              {
                comments: value.comments.map((content: string) => ({
                  content: content,
                })),
                threadContext: {
                  filePath: value.filePath,
                  rightFileStart: {
                    line: value.lineRange.start.line === 0 ? 1 : value.lineRange.start.line,
                    offset: value.lineRange.start.column === 0 ? 1 : value.lineRange.start.column,
                  },
                  rightFileEnd: {
                    line: value.lineRange.end.line === 0 ? 1 : value.lineRange.end.line,
                    offset: value.lineRange.end.column === 0 ? 1 : value.lineRange.end.column,
                  },
                },
              },
            ],
          });
        }
    
        return result;
      }
}

Main.Main();
