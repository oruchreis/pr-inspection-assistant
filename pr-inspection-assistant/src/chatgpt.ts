import tl = require('azure-pipelines-task-lib/task');
import { encode } from 'gpt-tokenizer';
import OpenAI from "openai";

export class ChatGPT {
    private readonly systemMessage: string = '';
    private readonly maxTokens: number = 128000;

    constructor(private _openAi: OpenAI, checkForBugs: boolean = false, checkForPerformance: boolean = false, checkForBestPractices: boolean = false, modifiedLinesOnly: boolean = true, additionalPrompts: string[] = []) {
        this.systemMessage = `Your task is to act as a code reviewer of a Pull Request:
        - You are provided with the code changes (diff) in a unidiff format.
        - You are provided with existing comments on the file, provide any additional code review comments that are not duplicates.
        - The response should be JSON with each comment content in markdown format, but do not wrap it in a markdown fenced codeblock.
        - Do not highlight minor issues and nitpicks.
        ${modifiedLinesOnly ? '- Only comment on modified lines.' : ''}
        ${checkForBugs ? '- If there are any bugs, highlight them.' : ''}
        ${checkForPerformance ? '- If there are major performance problems, highlight them.' : ''}
        ${checkForBestPractices ? '- Provide details on missed use of best-practices.' : '- Do not provide comments on best practices.'}
        ${additionalPrompts.length > 0 ? additionalPrompts.map(str => `- ${str}`).join('\n') : ''}`;

        this.systemMessage += `\n The response should be in this JSON format:\n
        {
            threads: [
                {
                    comments: [
                        {
                            content: comment,
                            commentType: 2
                        }
                    ],
                    status: 1,
                    threadContext: {
                        filePath: fileName,
                        leftFileEnd: null,
                        leftFileStart: null,
                        rightFileEnd: {
                            line: 5,
                            offset: 13
                        },
                        rightFileStart: {
                            line: 5,
                            offset: 1
                        }
                    },
                    pullRequestThreadContext: {
                        changeTrackingId: 1,
                        iterationContext: {
                            firstComparingIteration: 1,
                            secondComparingIteration: 2
                        }
                    }
                }
            ]
        }`

        console.info(`System prompt: ${this.systemMessage}`);
    }

    public async PerformCodeReview(diff: string, fileName: string, existingComments: string[]): Promise<any> {
        if (!fileName.startsWith('/')) {
            fileName = `/${fileName}`;
        }
        let model = tl.getInput('ai_model', true) as | (string & {})
            | 'o1-mini'
            | 'o1-preview'
            | 'gpt-4o'
            | 'gpt-4'
            | 'gpt-3.5-turbo';

        let prompt = `Here is the diff of code changes for the file '${fileName}':\n${diff}\nHere are existing comments for this file:\n`;
        existingComments.forEach((comment, index) => {
            prompt += `${index + 1}. ${comment}\n`;
        });

        
        console.info(`Model: ${model}`);
        console.info(`Prompt: ${prompt}`);
        if (!this.doesMessageExceedTokenLimit(this.systemMessage + prompt, this.maxTokens)) {
            let openAi = await this._openAi.chat.completions.create({
                messages: [
                    {
                        role: model == 'o1-preview' || model == "o1-mini" ? 'assistant' : 'system',
                        content: this.systemMessage
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ], model: model
            });

            let response = openAi.choices;

            if (response.length > 0) {
                let comment = response[0].message.content!;
                console.info(`Response:\n${comment}`);
                return comment;
            }
        }
        tl.warning(`Unable to process diff for file ${fileName} as it exceeds token limits.`)
        return ;
    }

    private doesMessageExceedTokenLimit(message: string, tokenLimit: number): boolean {
        let tokens = encode(message);
        console.info(`Token count: ${tokens.length}`);
        return tokens.length > tokenLimit;
    }
}