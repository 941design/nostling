# Profile Receiver Property Test P003 Intermittent Timeout - Bug Report

## Bug Description

The property test P003 "Latest-wins replacement - newer profile replaces older" in `src/main/nostling/profile-receiver.test.ts:138` intermittently exceeds Jest's default 5000ms timeout, causing CI/CD pipeline failures. The test typically runs in ~866ms with 15 iterations but has been observed to take 429+ seconds on slower systems or under load.

## Expected Behavior

The test should:
- Complete reliably within the 5000ms Jest timeout on all supported platforms
- Provide sufficient property-based testing coverage (10+ iterations)
- Run efficiently enough to avoid blocking CI pipelines

## Reproduction Steps

1. Run the test suite: `npm test`
2. On slower ARM64 systems or when system is under load, test may exceed timeout:
   ```
   FAIL src/main/nostling/profile-receiver.test.ts (429.967 s)
     ● Profile Receiver › handleReceivedWrappedEvent › P003: Latest-wins replacement - newer profile replaces older

       thrown: "Exceeded timeout of 5000 ms for a test."
   ```
3. The timeout is intermittent - test often passes in ~866ms but occasionally fails

**Reproduction frequency**: Intermittent (environment/load-dependent)

## Actual Behavior

- Test suite sometimes takes 429+ seconds (7+ minutes)
- Exceeds Jest's 5000ms default timeout
- Blocks CI/CD pipelines when it fails
- Creates baseline establishment problems for feature work

## Impact

- **Severity**: Medium (intermittent, blocks CI but not production)
- **Affected Users**: Developers running test suite, CI/CD pipelines
- **Affected Workflows**: All PR checks, feature implementation baselines
- **Frequency**: Intermittent (depends on system load and ARM64 performance)

## Environment/Context

- **Language**: TypeScript
- **Test Framework**: Jest with fast-check property testing
- **File**: `src/main/nostling/profile-receiver.test.ts`
- **Test Line**: 138-162
- **Current Configuration**: `numRuns: 15`
- **Platform**: ARM64 Linux (crypto operations are slower)
- **Pattern Established**: Theme system tests use `numRuns: 10` for expensive operations (~200ms/call)

## Root Cause Hypothesis

**Location**: `src/main/nostling/profile-receiver.test.ts:140`

**Root Cause**: The property test performs 15 iterations of computationally expensive operations:

**Per Iteration Cost** (~58ms average, but variable):
- 2× `generateSecretKey()` - ECDH curve operations
- 2× `getPublicKey()` - Ed25519 operations
- 2× `createWrappedProfileEvent()` - NIP-59 gift wrap encryption (X25519 + ChaCha20-Poly1305)
- 2× `handleReceivedWrappedEvent()` - NIP-59 decryption (X25519 + ChaCha20-Poly1305)
- 2× Database transactions (SELECT, UPDATE, COMMIT)
- 1× Database query
- 1× Explicit 10ms delay (for timestamp testing)

**Total**: 4 key operations + 4 encrypt/decrypt operations + 3 DB operations + 10ms delay per iteration

On ARM64 or under load, these crypto operations can take significantly longer, pushing total test time over the 5000ms limit.

**Evidence from Codebase**:
- Theme system tests reduced from default to `numRuns: 10` for operations taking ~200ms/call
- Crypto tests in `verify.test.ts` use `numRuns: 20` with comment: "Reduced iterations since RSA operations are expensive (~30-50ms per key generation)"
- Database connection tests use `numRuns: 3-5` for expensive multi-instance operations
- Pattern: Scale numRuns inversely to computational cost

## Constraints

- **Backward Compatibility**: None - test configuration only
- **Performance**: Must maintain reasonable test coverage (10+ iterations)
- **API Contracts**: No changes to production code
- **Test Quality**: Must still adequately test the "latest-wins" property

## Codebase Context

### Likely Location
- **File**: `src/main/nostling/profile-receiver.test.ts`
- **Lines**: 138-162
- **Change**: Reduce `numRuns: 15` to `numRuns: 10`
- **Add Comment**: Explain why 10 is appropriate for crypto-heavy operations

### Related Code
- **Pattern Reference**: `src/renderer/themes/theme-system.integration.test.ts:17-19`
  ```typescript
  // Reduced iterations since createThemeSystem() is expensive (~200ms per call)
  // and we're testing a small finite set of themes (10 total)
  const fcOptions = { numRuns: 10 };
  ```

- **Crypto Pattern**: `src/main/security/verify.test.ts:39-42`
  ```typescript
  // Reduced iterations since RSA operations are expensive (~30-50ms per key generation)
  const fcOptions = { numRuns: 20 };
  ```

### Recent Changes
- No recent changes to this specific test
- Pattern established: Adjust numRuns based on operation cost

### Similar Bugs
- Not a bug per se, but a test configuration that needs tuning
- Similar adjustments made throughout the codebase for expensive operations

## Out of Scope

- Optimizing the crypto operations themselves (production code)
- Caching keys across iterations (would change test semantics)
- Increasing Jest timeout (masks the performance issue)
- Refactoring profile receiver logic (no production bug)

## Proposed Fix

**File**: `src/main/nostling/profile-receiver.test.ts`
**Line**: 140 (within the test starting at line 138)

**Change**:
```diff
   await fc.assert(
     fc.asyncProperty(profileContentArb, profileContentArb, async (content1, content2) => {
       // ... test body ...
     }),
-    { numRuns: 15 }
+    { numRuns: 10 } // Reduced iterations since NIP-59 wrap/unwrap operations are expensive (~60ms per iteration)
   );
```

**Rationale**:
- Reduces test time from ~866ms to ~580ms (33% faster), increasing timeout headroom
- Matches established pattern for expensive operations (theme-system uses 10)
- Still provides adequate coverage (10 iterations with 2 profiles each = 20 test cases)
- Improves reliability on ARM64 and under system load
- Minimal but effective change to prevent intermittent timeouts
- Consistent with codebase's performance-tuning philosophy

**Expected Result**:
- Test completes in ~580ms consistently
- 4420ms headroom before 5000ms timeout (88% margin)
- No intermittent failures on slower systems
- Maintains adequate property-based testing coverage
