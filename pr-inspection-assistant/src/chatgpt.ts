import tl = require('azure-pipelines-task-lib/task');
import { encode } from 'gpt-tokenizer';
import OpenAI from "openai";

export class ChatGPT {
    private readonly systemMessage: string = '';
    private readonly maxTokens: number = 128000;

    constructor(private _openAi: OpenAI, checkForBugs: boolean = false, checkForPerformance: boolean = false, checkForBestPractices: boolean = false, modifiedLinesOnly: boolean = true, additionalPrompts: string[] = [], language: string = 'English') {
        this.systemMessage = `Your task is to review a pull request in Azure DevOps and response a raw json.
        - The response must follow this JSON format(without fenced codeblock):
          \`\`\`
          [
              {
                  "filePath": "$filePath",
                  "comments": [
                      {
                          "comment": "Your comment here.",
                          "highlight": {
                              "start": { "line": 1, "column": 1 },
                              "end": { "line": 1, "column": 1 }
                          }
                      }
                  ]
              }
          ]
          \`\`\`
        - Don't return filePath and comments if no comment is needed for file. Return \`[]\` as a response if no comment is needed at all for any file.
        - You get \`diffByFilePath\` which includes \`filePath\` and corresponding code changes (\`diff\`) and existing comments (\`existingComments\`). Avoid duplicating similar comments.
        - The code changes (\`diff\`) are in Unified Diff format, which includes lines like in this regex \`@@\\s*[+-][0-9]+,[0-9]+\\s+[+-](?<new_line>[0-9]+),[0-9]+\\s*@@.\`
          Use the \`new_line\` captured by the regex group \`(?<new_line>)\` to determine the starting line in the right file and calculate subsequent lines.
        - Highlight your comment in the code in specific range by using \`highlight\` which represents start and end of highlighting of your comment which calculated by \`new_line\`. 
        - Calculate highlighted \`column\` range which represents the specific range of the comment in the line.
        - Ensure all values (\`highlight.start.line\`, \`highlight.end.line\`, \`highlight.start.column\`, \`highlight.end.column\`) > 0 (minimum value: 1).

        - Ignore minor issues and nitpicks.
        - Do not include teaching or unnecessary explanations.
        - Comments must be concise and in '${language}' language.
        - ${modifiedLinesOnly ? 'Only comment on modified lines.' : ''}
        - ${checkForBugs ? 'Highlight bugs.' : ''}
        - ${checkForPerformance ? 'Highlight performance issues.' : ''}
        - ${checkForBestPractices ? 'Suggest best practices.' : 'Avoid suggesting best practices.'}
        - ${additionalPrompts.length > 0 ? additionalPrompts.map(str => `- ${str}`).join('\n') : ''}
        `;

        console.info(`System prompt:\n${this.systemMessage}`);
    }

    public async PerformCodeReview(diffByFilePath: Map<string, any>): Promise<any> {        
        let model = tl.getInput('ai_model', true) as | (string & {})
            | 'o1-mini'
            | 'o1-preview'
            | 'gpt-4o'
            | 'gpt-4o-mini'
            | 'gpt-4'
            | 'gpt-3.5-turbo';

        let userPrompt = {
            diffByFilePath: Array.from(diffByFilePath, ([filePath, diffAndComments]) => ({
                filePath: filePath.startsWith("/") ? filePath : `/${filePath}`,
                diff: diffAndComments.diff,
                existingComments: diffAndComments.existingComments
            }))
        };

        let prompt = JSON.stringify(userPrompt, null, 4);
        console.info(`Model: ${model}`);
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
        tl.warning(`Unable to process PR as it exceeds token limits.`);
        return {};
    }

    private doesMessageExceedTokenLimit(message: string, tokenLimit: number): boolean {
        let tokens = encode(message);
        console.info(`Token count: ${tokens.length}`);
        return tokens.length > tokenLimit;
    }
}