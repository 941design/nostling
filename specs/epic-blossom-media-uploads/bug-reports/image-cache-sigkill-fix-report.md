# Image Cache Service Test Worker SIGKILL - Bug Report

## Bug Description

The property-based tests in `src/main/image-cache/image-cache-service.test.ts` cause a Jest worker to be killed with SIGKILL during execution. The test file contains 10 property tests with NO explicit `numRuns` configuration, causing fast-check to use its default of 100 iterations per test. Combined with large buffer generation (up to 10KB), file I/O operations, and in-memory data structures, this exhausts the Jest worker's heap memory.

## Expected Behavior

The tests should:
- Complete reliably without triggering SIGKILL
- Use appropriate numRuns values scaled to operation cost
- Match the established codebase pattern for resource-intensive property tests

## Reproduction Steps

1. Run the test suite: `npm test`
2. The image-cache-service test worker gets killed with SIGKILL:
   ```
   FAIL src/main/image-cache/image-cache-service.test.ts
     ● Test suite failed to run
       A worker process has failed to exit gracefully and has been force exited.
       This is likely caused by tests leaking due to improper teardown.
   ```
3. Or alternatively: worker killed by OS due to memory exhaustion

**Reproduction frequency**: Intermittent (depends on system memory and concurrent test load)

## Actual Behavior

- Jest worker killed with SIGKILL during test execution
- Worker process exceeds available heap space
- Tests fail to complete, blocking CI/CD pipelines
- Other tests may be affected by resource contention

## Impact

- **Severity**: Medium (intermittent, blocks CI but not production)
- **Affected Users**: Developers running test suite, CI/CD pipelines
- **Affected Workflows**: All PR checks, feature implementation baselines
- **Frequency**: Intermittent (depends on system memory, concurrent workers, ARM64 performance)

## Environment/Context

- **Language**: TypeScript
- **Test Framework**: Jest with fast-check 4.5.3 property testing
- **File**: `src/main/image-cache/image-cache-service.test.ts`
- **Test Count**: 10 property tests (7 async + 3 sync)
- **Current Configuration**: NO explicit numRuns (defaults to 100)
- **Platform**: ARM64 Linux (memory-constrained Jest workers)
- **Pattern Established**: Other tests use numRuns: 3-20 for expensive operations

## Root Cause Hypothesis

**Location**: `src/main/image-cache/image-cache-service.test.ts` (all property tests)

**Root Cause**: 10 property tests use fast-check's default 100 iterations without explicit `numRuns` configuration. Each iteration involves:

**Per Iteration Cost** (varies by test):
- Buffer generation: 10 bytes to 10,000 bytes (Uint8Array)
- File I/O: `fs.writeFile()`, `fs.readFile()`, `fs.unlink()`, `fs.access()`
- Temp directory creation/cleanup
- In-memory Maps, arrays, and metadata objects
- LRU eviction sorting (Array.from + sort)

**Memory-Intensive Tests**:
1. Line 553-572: "cache->get round-trip" - generates buffers up to **10KB** per iteration × 100 = ~1MB+ data
2. Line 213-239: "total cache size" - 20-item arrays with 100-1000 byte buffers × 100 = ~10MB+
3. Line 157-173: "URL matching" - creates full service instances + file I/O × 100

**Total across file**: ~1,000 iterations (10 tests × 100) with cumulative memory from:
- Buffer allocations (not garbage collected fast enough)
- Temp file handles
- Map entries and metadata
- Jest worker overhead

**Evidence from Codebase**:
- `database/connection.test.ts`: `numRuns: 3-5` (expensive multi-instance DB operations)
- `security/verify.test.ts`: `numRuns: 20` (RSA key generation ~30-50ms)
- `profile-receiver.test.ts`: `numRuns: 10` (NIP-59 crypto ~60ms, recently fixed)
- `theme-system.integration.test.ts`: `numRuns: 10` (expensive ~200ms operations)
- **image-cache-service.test.ts**: NO configuration = default 100 (ANOMALY)

## Constraints

- **Backward Compatibility**: None - test configuration only
- **Performance**: Must maintain reasonable test coverage (5+ iterations per property)
- **API Contracts**: No changes to production code
- **Test Quality**: Must still adequately test cache behavior properties
- **Consistency**: Must match established codebase pattern for numRuns configuration

## Codebase Context

### Likely Location
- **File**: `src/main/image-cache/image-cache-service.test.ts`
- **Changes**: Add explicit `numRuns` to all 10 property tests
- **Values**: Scale numRuns inversely to operation cost:
  - File I/O + large buffers (round-trip, eviction): numRuns: 5
  - File I/O + small buffers (URL matching, metadata): numRuns: 10
  - In-memory only (sync properties): numRuns: 15-20

### Related Code
- **Pattern Reference**: `src/renderer/themes/theme-system.integration.test.ts:17-19`
  ```typescript
  // Reduced iterations since createThemeSystem() is expensive (~200ms per call)
  const fcOptions = { numRuns: 10 };
  ```

- **Database Pattern**: `src/main/database/connection.test.ts`
  ```typescript
  const fcOptions = { numRuns: 3 }; // Expensive multi-instance operations
  ```

- **Crypto Pattern**: `src/main/security/verify.test.ts:39-42`
  ```typescript
  const fcOptions = { numRuns: 20 }; // RSA operations ~30-50ms
  ```

### Recent Changes
- File appears newly added (commit 900365f)
- No performance tuning applied yet
- Pattern established: Adjust numRuns based on operation cost

### Similar Bugs
- **Bug 1**: Profile receiver P003 timeout (numRuns: 15 too high for crypto) - FIXED
- **Bug 2**: Label validation whitespace (generator constraint missing) - FIXED
- **Bug 3**: This bug - same pattern of missing numRuns configuration

## Out of Scope

- Optimizing the image cache service implementation
- Changing file I/O patterns in production code
- Increasing Jest worker memory limits (masks the resource issue)
- Adding memory profiling infrastructure
- Refactoring test structure beyond numRuns configuration

## Proposed Fix

**File**: `src/main/image-cache/image-cache-service.test.ts`

**Change**: Add explicit `numRuns` configuration to all property tests, scaled to operation cost.

**Approach**:
- Define a shared `fcOptions` constant at the top of the describe block
- Use lower values for file I/O heavy tests
- Use moderate values for memory-only tests

```diff
+ // Reduced iterations since image cache tests involve file I/O operations
+ // (write, read, delete) and buffer allocations (up to 10KB per iteration).
+ // Default 100 iterations causes Jest worker memory exhaustion (SIGKILL).
+ const fcFileIO = { numRuns: 5 };   // Tests with file system operations
+ const fcMemOnly = { numRuns: 15 }; // Tests with in-memory operations only

  // For each fc.assert() call, add appropriate options:
  await fc.assert(
    fc.asyncProperty(..., async (...) => { ... }),
-   // no numRuns (defaults to 100)
+   fcFileIO  // or fcMemOnly depending on test
  );
```

**Rationale**:
- File I/O tests (numRuns: 5): 5 iterations × file write/read/delete is sufficient for property coverage
- Memory-only tests (numRuns: 15): No file I/O, cheaper operations, can afford more iterations
- Matches established pattern: database tests use 3-5, crypto uses 10-20
- Reduces memory pressure from ~1,000 iterations to ~100 total across file
- 90% reduction in resource usage while maintaining adequate test coverage

**Expected Result**:
- No SIGKILL during test execution
- Test suite completes reliably
- Adequate property-based testing coverage maintained
- Memory usage stays within Jest worker limits
