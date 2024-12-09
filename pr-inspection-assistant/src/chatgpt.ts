import tl = require('azure-pipelines-task-lib/task');
import { encode } from 'gpt-tokenizer';
import OpenAI from "openai";

export class ChatGPT {
    private readonly systemMessage: string = '';
    private readonly maxTokens: number = 128000;

    constructor(private _openAi: OpenAI, checkForBugs: boolean = false, checkForPerformance: boolean = false, checkForBestPractices: boolean = false, modifiedLinesOnly: boolean = true, additionalPrompts: string[] = []) {
        this.systemMessage = `Your task is to act as a code reviewer of a Pull Request:
        - You are provided with the code changes (diffs) in a unidiff format.
        - Use bullet points if you have multiple comments.
        - Do not highlight minor issues and nitpicks.
        - Only provide instructions for improvements.
        - If you have no instructions respond with NO_COMMENT only, otherwise provide your instructions.
        - The response should be in markdown format, but do not wrap it in a markdown fenced codeblock.
        ${modifiedLinesOnly ? '- Only comment on modified lines.' : ''}
        ${checkForBugs ? '- If there are any bugs, highlight them.' : ''}
        ${checkForPerformance ? '- If there are major performance problems, highlight them.' : ''}
        ${checkForBestPractices ? '- Provide details on missed use of best-practices.' : ''}
        ${additionalPrompts.length > 0 ? additionalPrompts.map(str => `- ${str}`).join('\n') : ''}`
    }

    public async PerformCodeReview(diff: string, fileName: string): Promise<string> {

        let model = tl.getInput('ai_model', true) as | (string & {})
            | 'o1-mini'
            | 'o1-preview'
            | 'gpt-4o'
            | 'gpt-4'
            | 'gpt-3.5-turbo';

        console.info(`Model: ${model}`);
        //console.info(`Diff: ${diff}`);
        console.info(`System prompt: ${this.systemMessage}`);
        if (!this.doesMessageExceedTokenLimit(diff + this.systemMessage, this.maxTokens)) {
            let openAi = await this._openAi.chat.completions.create({
                messages: [
                    {
                        role: model == 'o1-preview' || model == "o1-mini" ? 'assistant' : 'system',
                        content: this.systemMessage
                    },
                    {
                        role: 'user',
                        content: diff
                    }
                ], model: model
            });

            let response = openAi.choices;

            if (response.length > 0) {
                let comment = response[0].message.content!;
                console.info(`Comment: ${comment}`);
                return comment;
            }
        }
        tl.warning(`Unable to process diff for file ${fileName} as it exceeds token limits.`)
        return '';
    }

    private doesMessageExceedTokenLimit(message: string, tokenLimit: number): boolean {
        let tokens = encode(message);
        console.info(`Token count: ${tokens.length}`);
        return tokens.length > tokenLimit;
    }

}