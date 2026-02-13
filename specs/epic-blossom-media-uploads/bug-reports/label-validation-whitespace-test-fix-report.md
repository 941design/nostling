# Label Validation Property Test Generates Invalid Whitespace-Only Strings - Bug Report

## Bug Description

The property test P004 for label validation in `src/renderer/main.test.ts:245` fails intermittently because the string generator `fc.string({ minLength: 1, maxLength: 50 })` can produce whitespace-only strings like `" "`, `"  "`, or `"\t"`. The validation logic correctly rejects these strings (as intended), but the test expects submission to be allowed for "valid" labels.

This causes the test to fail with:
```
Property failed after 8 tests
Counterexample: [" "]
Expected: true
Received: false
```

## Expected Behavior

The property test should only generate **valid** labels that the validation will accept:
- Labels with at least 1 non-whitespace character after trimming
- The test should pass 100% of the time with valid inputs
- The test generator should not produce edge cases that are intentionally rejected by validation

## Reproduction Steps

1. Run the test suite: `npm test`
2. The test `src/renderer/main.test.ts:245` may fail randomly depending on fast-check's seed
3. When it fails, the counterexample is a whitespace-only string like `[" "]`
4. The assertion `expect(nsecCanSubmit).toBe(true)` fails because `canSubmit(formNsec)` returns `false`

**Deterministic reproduction**: Run with seed 60567448:
```bash
npm test -- --testNamePattern="should allow submit with valid label"
```

## Actual Behavior

- Property test generator produces whitespace-only strings: `" "`, `"  "`, `"\t"`
- Validation correctly rejects these: `isLabelValid(" ")` returns `false`
- `canSubmit(form)` returns `false` for invalid labels
- Test assertion fails: Expected `true`, received `false`

## Impact

- **Severity**: Low (test flakiness, not production bug)
- **Affected Users**: Developers running test suite
- **Affected Workflows**: CI/CD pipelines may fail intermittently, blocking merges
- **Frequency**: Intermittent (depends on property test random seed)

## Environment/Context

- **Language**: TypeScript
- **Test Framework**: Jest with fast-check property testing
- **File**: `src/renderer/main.test.ts`
- **Test Line**: 245
- **Recent Related Fix**: Commit 23753bc (Feb 12, 2026) fixed the identical issue for nsec validation

## Root Cause Hypothesis

**Location**: `src/renderer/main.test.ts:246`

**Root Cause**: The property test generator is not constrained to produce only valid labels:
```typescript
fc.property(fc.string({ minLength: 1, maxLength: 50 }), (label) => {
  // This can generate whitespace-only strings
```

**Why This Matters**:
- The validation logic (`isLabelValid`) checks `label.trim().length > 0`
- When `label = " "`, `trim()` returns `""`, so validation fails
- The test expects `canSubmit` to be `true` for valid labels, but it's testing with invalid ones

**Evidence from Codebase**:
- Commit 23753bc fixed the **exact same bug** for nsec validation (line 282)
- All other property tests in the same file (lines 96, 113, 267, 281, 298, 312, 328, 343) use `.filter(s => s.trim().length > 0)`
- The pattern is used 40+ times across the entire test suite

## Constraints

- **Backward Compatibility**: None - this is a test-only change
- **Performance**: No impact - filter is applied at test generation time
- **API Contracts**: No production code changes required
- **Consistency**: Must match the established pattern from commit 23753bc

## Codebase Context

### Likely Location
- **File**: `src/renderer/main.test.ts`
- **Line**: 246
- **Change**: Add `.filter(s => s.trim().length > 0)` to the string generator

### Related Code
- **Validation Logic**: Lines 49-51 (`isLabelValid` function)
  ```typescript
  function isLabelValid(label: string): boolean {
    return label.trim().length > 0;
  }
  ```
- **Similar Tests**: Lines 96, 113, 267, 281, 298, 312, 328, 343 (all use the filter)
- **Production Code**: `src/renderer/main.tsx:1129` (same validation pattern)

### Recent Changes
- **Commit 23753bc**: Fixed identical whitespace issue in nsec property test
- **Pattern**: Added `.filter(s => s.trim().length > 0)` to generator

### Similar Bugs
This is the **second instance** of this bug:
1. **First**: Nsec validation test (fixed in commit 23753bc)
2. **Second**: Label validation test (this bug) - same root cause, same fix needed

## Out of Scope

- Refactoring validation logic (it's correct as-is)
- Changing test expectations (they're correct as-is)
- Modifying production code (no production bug exists)
- Performance optimizations (filter is negligible overhead)
- Adding new validation rules (scope is fixing the test generator only)

## Proposed Fix

**File**: `src/renderer/main.test.ts`
**Line**: 246

**Change**:
```diff
- fc.property(fc.string({ minLength: 1, maxLength: 50 }), (label) => {
+ fc.property(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), (label) => {
```

**Rationale**:
- Matches commit 23753bc fix pattern
- Aligns with 40+ other instances in codebase
- Prevents generator from producing invalid test data
- No changes to validation logic or test expectations needed
- Minimal, surgical fix to the root cause
