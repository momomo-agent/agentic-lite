# Test Result: task-1775525816399

## Summary
- Tests: 2 passed, 0 failed
- DBB-013: PASS

## Results

### DBB-013: custom provider used when provider="custom"
- customProvider.chat() called once; result.answer === 'custom-result'
- PASS

### DBB-013b: throws when provider="custom" but no customProvider
- ask() rejects with error containing 'customProvider'
- PASS
