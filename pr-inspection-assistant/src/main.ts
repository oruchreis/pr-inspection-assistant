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

        tl.setProgress(0, 'Getting Diff and Existing Comments');
        let diffByFilePath = new Map<string, any>();
        for (let index = 0; index < filesToReview.length; index++) {
            let filePath = filesToReview[index];
            let diffAndComments = {
                diff: await this._repository.GetDiff(filePath),
                existingComments: await this._pullRequest.GetCommentsForFile(filePath)
            };
            diffByFilePath.set(filePath, diffAndComments);
            console.info(`File: ${filePath}, Diff Length: ${diffAndComments.diff.length}, Existing comments: ${diffAndComments.existingComments.length}`);
            tl.setProgress((filesToReview.length /100) * index, 'Getting Diff and Existing Comments');
        }
        tl.setProgress(100, 'Getting Diff and Existing Comments');

        let reviewComment = await this._chatGpt.PerformCodeReview(diffByFilePath);
        console.info(`Completed review of files`);
        
        if (reviewComment) {
            tl.setProgress(0, 'Creating comments');
            let threads = this.prepareThreads(reviewComment as any[]);
            for (let index = 0; index < threads.length; index++){
                let thread = threads[index];
                await this._pullRequest.AddThread(thread);
                tl.setProgress((threads.length /100) * index, 'Creating comments');
            }
            tl.setProgress(100, 'Creating comments');
        }
        else
        {
            console.info(`Nothing to review`);
        }
        
        tl.setResult(tl.TaskResult.Succeeded, "Pull Request reviewed.");
    }

    private static prepareThreads(data: any[]): any[] {
        let grouped = new Map<string, any>();
    
        for (let file of data) {
          for (let comment of file.comments) {
            let highlightKey = `${comment.highlight.start.line},${comment.highlight.start.column}-${comment.highlight.end.line},${comment.highlight.end.column}`;
            let key = `${file.filePath}:${highlightKey}`;
    
            if (!grouped.has(key)) {
              grouped.set(key, {
                filePath: file.filePath,
                highlight: comment.highlight,
                comments: [],
              });
            }
    
            grouped.get(key)!.comments.push(comment.comment);
          }
        }
    
        let result: any[] = [];
        for (let value of grouped.values()) {
            result.push({
                comments: value.comments.map((content: string) => ({
                    content: content,
                })),
                threadContext: {
                    filePath: value.filePath,
                    rightFileStart: {
                        line: value.highlight.start.line === 0 ? 1 : value.highlight.start.line,
                        offset: value.highlight.start.column === 0 ? 1 : value.highlight.start.column,
                    },
                    rightFileEnd: {
                        line: value.highlight.end.line === 0 ? 1 : value.highlight.end.line,
                        offset: value.highlight.end.column === 0 ? 1 : value.highlight.end.column,
                    },
                },
            });
        }
    
        return result;
      }
}

Main.Main();
