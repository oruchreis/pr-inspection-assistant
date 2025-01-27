import tl = require('azure-pipelines-task-lib/task');
import { encode } from 'gpt-tokenizer';
import OpenAI from "openai";

export class ChatGPT {
    private readonly systemMessage: string = '';
    private readonly maxTokens: number = 128000;

    constructor(private _openAi: OpenAI, checkForBugs: boolean = false, checkForPerformance: boolean = false, checkForBestPractices: boolean = false, modifiedLinesOnly: boolean = true, additionalPrompts: string[] = []) {
        this.systemMessage = `Your task is to act as a code reviewer of a pull request within Azure DevOps.
        - You are provided with the code changes (diff) in a Unified Diff format.
        - You are provided with a file path (fileName).
        - You are provided with existing comments (existingComments) on the file, you must provide any additional code review comments that are not duplicates.
        - Do not highlight minor issues and nitpicks.
        ${modifiedLinesOnly ? '- Only comment on modified lines.' : ''}
        ${checkForBugs ? '- Highlight any bugs.' : ''}
        ${checkForPerformance ? '- Hşghlight performance problems.' : ''}
        ${checkForBestPractices ? '- Provide best-practices.' : '- Do not provide best practices.'}
        ${additionalPrompts.length > 0 ? additionalPrompts.map(str => `- ${str}`).join('\n') : ''}`;

        this.systemMessage += `The response must be a single JSON object (without fenced codeblock) and each thread refers to different lines and offsets in the code:
        {
            "threads": [
                {
                    "comments": [
                        {
                            "content": "put comment here in markdown format without markdown fenced codeblock."
                        }
                    ],
                    "threadContext": {
                        "filePath": "$fileName",
                        "rightFileStart": {
                            "line": $lineStart,
                            "offset": $offsetStart
                        },
                        "rightFileEnd": {
                            "line": $lineEnd,
                            "offset": $offsetEnd
                        }
                    }
                }
            ]
        }`

        console.info(`System prompt:\n${this.systemMessage}`);
    }

    public async PerformCodeReview(diff: string, fileName: string, existingComments: string[]): Promise<any> {
        if (!fileName.startsWith('/')) {
            fileName = `/${fileName}`;
        }
        let model = tl.getInput('ai_model', true) as | (string & {})
            | 'o1-mini'
            | 'o1-preview'
            | 'gpt-4o'
            | 'gpt-4o-mini'
            | 'gpt-4'
            | 'gpt-3.5-turbo';

        let userPrompt = {
            fileName: fileName,
            diff: diff,
            existingComments: existingComments
        };

        let prompt = JSON.stringify(userPrompt, null, 4);
        console.info(`Model: ${model}`);
        // console.info(`Diff:\n${diff}`);
        // console.info(`Prompt:\n${prompt}`);
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
                let content = response[0].message.content!;
                console.info(`Comments:\n${content}`);
                return JSON.parse(content);
            }
        }
        tl.warning(`Unable to process diff for file ${fileName} as it exceeds token limits.`);
        return {};
    }

    private doesMessageExceedTokenLimit(message: string, tokenLimit: number): boolean {
        let tokens = encode(message);
        console.info(`Token count: ${tokens.length}`);
        return tokens.length > tokenLimit;
    }
}