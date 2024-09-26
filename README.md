# OpenAI PR Review Bot for Azure DevOps

Automate pull request (PR) reviews in Azure DevOps using OpenAI. This bot analyzes code changes, offers suggestions, detects potential bugs, and ensures adherence to coding standards. Streamline code reviews with customizable criteria and natural language feedback, improving code quality and reducing review time.

## Key Features

- **Automated PR Reviews**: Leverage OpenAI to analyze code changes in pull requests.
- **Code Quality Suggestions**: Detect potential issues and ensure best practices are followed.
- **Customizable Review Criteria**: Tailor the bot to specific code quality metrics.
- **Azure DevOps Integration**: Seamlessly integrates with existing DevOps pipelines.
- **Natural Language Feedback**: Provides human-readable, actionable feedback.

## Use Cases

- **Automate Routine PR Tasks**: Speed up the code review process by automating common review tasks.
- **Improve Code Quality**: Receive consistent, detailed feedback to enhance code quality.
- **Early Bug Detection**: Help developers understand best practices and identify bugs early in the development cycle.

## Prerequisites

- An [OpenAI API Key](https://platform.openai.com/docs/overview)

## Getting Started

1. **Install the AI Code Review DevOps Extension**

   Install the AI Code Review DevOps extension from the Azure DevOps Marketplace.

2. **Add the OpenAI Code Review Task to Your Pipeline**

   Add the following YAML snippet to your pipeline configuration to set up the OpenAI code review task:

   ```yaml
   trigger:
     branches:
       exclude:
         - '*'

   pr:
     branches:
       include:
         - '*'

   jobs:
     - job: CodeReview
       pool:
         vmImage: 'ubuntu-latest'
       steps:
         - checkout: self
           persistCredentials: true
         - task: PRIA@1
           inputs:
             api_key: $(OpenAI_ApiKey)
## FAQ

### Q: What permissions are required for Build Administrators?

A: Build Administrators must be given "Contribute to pull requests" access. Check [this Stack Overflow answer](https://stackoverflow.com/a/57985733) for guidance on setting up permissions.

## Resources
- [Marketplace Pipeline Extension](https://learn.microsoft.com/en-us/azure/devops/extend/develop/add-build-task?toc=%2Fazure%2Fdevops%2Fmarketplace-extensibility%2Ftoc.json&view=azure-devops)
- [Publisher Portal](https://marketplace.visualstudio.com/manage/publishers)