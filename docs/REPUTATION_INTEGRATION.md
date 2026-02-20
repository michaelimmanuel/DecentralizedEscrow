# Reputation System Integration

The reputation system has been successfully integrated into the escrow instructions!

## What Was Implemented

### 1. **release_funds** - Successful Trade Tracking
- Both buyer and seller get +1 successful trade when funds are released
- Optional reputation accounts: `buyerReputation`, `sellerReputation`

### 2. **refund_buyer** - Failed Trade Tracking  
- Both buyer and seller get +1 failed trade when disputed escrow is refunded
- Optional reputation accounts: `buyerReputation`, `sellerReputation`

### 3. **resolve_dispute** - Resolution-Based Tracking
- **FavorBuyer**: Buyer gets +1 successful, Seller gets +1 failed
- **FavorSeller**: Seller gets +1 successful, Buyer gets +1 failed  
- **Split**: Both get +1 failed (shared responsibility)
- Optional reputation accounts: `buyerReputation`, `sellerReputation`

## How to Use

### Initialize Reputation (One-time per user)
```typescript
await program.methods
  .initializeReputation()
  .accounts({
    user: userPublicKey,
    payer: payerPublicKey,
  })
  .rpc();
```

### Release Funds WITH Reputation Tracking
```typescript
// Derive reputation PDAs
const [buyerRepPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("reputation"), buyer.publicKey.toBuffer()],
  program.programId
);

const [sellerRepPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("reputation"), seller.publicKey.toBuffer()],
  program.programId  
);

// Release with reputation tracking
await program.methods
  .releaseFunds()
  .accounts({
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    buyerReputation: buyerRepPda,     // Optional
    sellerReputation: sellerRepPda,   // Optional
  })
  .signers([buyer])
  .rpc();
```

### Release Funds WITHOUT Reputation Tracking (Backward Compatible)
```typescript
await program.methods
  .releaseFunds()
  .accounts({
    buyer: buyer.publicKey,
    seller: seller.publicKey,
    // Omit reputation accounts - still works!
  })
  .signers([buyer])
  .rpc();
```

## Features

✅ **Optional & Backward Compatible** - Existing code works without changes  
✅ **Automatic Tracking** - Reputation updates happen within escrow instructions  
✅ **Event Emissions** - `ReputationUpdated` events for each change  
✅ **Safe Math** - Uses saturating arithmetic to prevent overflows  

## TypeScript Note

Due to Anchor's TypeScript generation limitations with optional accounts, you may see type errors when passing reputation accounts. These are cosmetic - the code works correctly at runtime. The IDL properly marks them as optional.

**Workaround if needed:**
```typescript
// Use type assertion if TypeScript complains
.accounts({
  ...otherAccounts,
  buyerReputation: buyerRepPda,
  sellerReputation: sellerRepPda,
} as any)
```

## Testing

Run the comprehensive integration tests:
```bash
anchor test -- --grep "reputation"
```

Or run individual test files:
```bash
anchor test -- tests/initialize_reputation.ts
anchor test -- tests/update_reputation.ts  
anchor test -- tests/reputation_integration.ts
```

## Reputation Calculation

The `Reputation` account provides helper methods:
- `total_trades()` - Returns successful + failed trades
- `success_rate()` - Returns percentage (0-100) of successful trades

Query reputation:
```typescript
const rep = await program.account.reputation.fetch(reputationPda);
console.log(`Success: ${rep.successfulTrades}, Failed: ${rep.failedTrades}`);
console.log(`Total: ${rep.successfulTrades + rep.failedTrades}`);
```
