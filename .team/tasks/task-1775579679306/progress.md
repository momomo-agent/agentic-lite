# Make AgenticConfig.apiKey optional for custom provider

## Progress

- Verified types.ts already has `apiKey?: string` (optional)
- Verified provider.ts already skips apiKey check for `provider='custom'`
- Updated README.md: apiKey field description to note it's optional for custom provider
- Updated README.md: custom provider example comment to say "no apiKey needed"
