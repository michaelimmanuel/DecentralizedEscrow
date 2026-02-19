import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("update_reputation", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const REPUTATION_SEED = Buffer.from("reputation");

  let user: anchor.web3.Keypair;
  let reputationPda: PublicKey;

  before(async () => {
    // Create test user
    user = anchor.web3.Keypair.generate();

    // Airdrop SOL to user
    const airdropSig = await provider.connection.requestAirdrop(
      user.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive reputation PDA
    [reputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, user.publicKey.toBuffer()],
      program.programId
    );

    // Initialize reputation for the user
    await program.methods
      .initializeReputation()
      .accounts({
        user: user.publicKey,
        payer: provider.wallet.publicKey,
      })
      .rpc();
  });

  it("Updates reputation with successful trade", async () => {
    const authority = provider.wallet;

    // Update reputation with successful trade
    const tx = await program.methods
      .updateReputation({ successful: {} })
      .accounts({
        user: user.publicKey,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("Update reputation (successful) transaction signature:", tx);

    // Fetch the reputation account
    const reputationAccount = await program.account.reputation.fetch(reputationPda);

    // Verify reputation was updated
    assert.equal(reputationAccount.successfulTrades.toNumber(), 1);
    assert.equal(reputationAccount.failedTrades.toNumber(), 0);

    console.log("  Reputation updated successfully");
    console.log(`  Successful Trades: ${reputationAccount.successfulTrades.toNumber()}`);
    console.log(`  Failed Trades: ${reputationAccount.failedTrades.toNumber()}`);
  });

  it("Updates reputation with failed trade", async () => {
    const authority = provider.wallet;

    // Update reputation with failed trade
    const tx = await program.methods
      .updateReputation({ failed: {} })
      .accounts({
        user: user.publicKey,
        authority: authority.publicKey,
      })
      .rpc();

    console.log("Update reputation (failed) transaction signature:", tx);

    // Fetch the reputation account
    const reputationAccount = await program.account.reputation.fetch(reputationPda);

    // Verify reputation was updated
    assert.equal(reputationAccount.successfulTrades.toNumber(), 1); // From previous test
    assert.equal(reputationAccount.failedTrades.toNumber(), 1);

    console.log("  Reputation updated with failed trade");
    console.log(`  Successful Trades: ${reputationAccount.successfulTrades.toNumber()}`);
    console.log(`  Failed Trades: ${reputationAccount.failedTrades.toNumber()}`);
  });

  it("Increments successful trades multiple times", async () => {
    const authority = provider.wallet;

    // Get initial state
    let reputationAccount = await program.account.reputation.fetch(reputationPda);
    const initialSuccessful = reputationAccount.successfulTrades.toNumber();

    // Update multiple times
    const updates = 5;
    for (let i = 0; i < updates; i++) {
      await program.methods
        .updateReputation({ successful: {} })
        .accounts({
          user: user.publicKey,
          authority: authority.publicKey,
        })
        .rpc();
    }

    // Fetch updated account
    reputationAccount = await program.account.reputation.fetch(reputationPda);

    // Verify all updates were applied
    assert.equal(
      reputationAccount.successfulTrades.toNumber(),
      initialSuccessful + updates
    );

    console.log(`  Successfully incremented successful trades ${updates} times`);
    console.log(`  Total Successful Trades: ${reputationAccount.successfulTrades.toNumber()}`);
  });

  it("Increments failed trades multiple times", async () => {
    const authority = provider.wallet;

    // Get initial state
    let reputationAccount = await program.account.reputation.fetch(reputationPda);
    const initialFailed = reputationAccount.failedTrades.toNumber();

    // Update multiple times
    const updates = 3;
    for (let i = 0; i < updates; i++) {
      await program.methods
        .updateReputation({ failed: {} })
        .accounts({
          user: user.publicKey,
          authority: authority.publicKey,
        })
        .rpc();
    }

    // Fetch updated account
    reputationAccount = await program.account.reputation.fetch(reputationPda);

    // Verify all updates were applied
    assert.equal(
      reputationAccount.failedTrades.toNumber(),
      initialFailed + updates
    );

    console.log(`  Successfully incremented failed trades ${updates} times`);
    console.log(`  Total Failed Trades: ${reputationAccount.failedTrades.toNumber()}`);
  });

  it("Updates reputation for multiple users", async () => {
    const users = [
      anchor.web3.Keypair.generate(),
      anchor.web3.Keypair.generate(),
    ];

    for (const testUser of users) {
      // Airdrop SOL
      const airdropSig = await provider.connection.requestAirdrop(
        testUser.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Derive reputation PDA
      const [userReputationPda] = PublicKey.findProgramAddressSync(
        [REPUTATION_SEED, testUser.publicKey.toBuffer()],
        program.programId
      );

      // Initialize reputation
      await program.methods
        .initializeReputation()
        .accounts({
          user: testUser.publicKey,
          payer: provider.wallet.publicKey,
        })
        .rpc();

      // Update with successful trade
      await program.methods
        .updateReputation({ successful: {} })
        .accounts({
          user: testUser.publicKey,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      // Verify
      const repAccount = await program.account.reputation.fetch(userReputationPda);
      assert.equal(repAccount.successfulTrades.toNumber(), 1);
      assert.equal(repAccount.failedTrades.toNumber(), 0);
    }

    console.log(`  Successfully updated reputation for ${users.length} users`);
  });

  it("Cannot update non-existent reputation account", async () => {
    const nonExistentUser = anchor.web3.Keypair.generate();

    // Derive reputation PDA for user that hasn't initialized reputation
    const [nonExistentReputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, nonExistentUser.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .updateReputation({ successful: {} })
        .accounts({
          user: nonExistentUser.publicKey,
          authority: provider.wallet.publicKey,
        })
        .rpc();

      assert.fail("Expected error when updating non-existent reputation");
    } catch (error) {
      // Expected to fail - account doesn't exist
      expect(error.message).to.include("AccountNotInitialized");
      console.log("  Correctly prevented updating non-existent reputation");
    }
  });

  it("Maintains correct statistics after mixed updates", async () => {
    // Create new user for clean test
    const testUser = anchor.web3.Keypair.generate();

    const airdropSig = await provider.connection.requestAirdrop(
      testUser.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const [testReputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, testUser.publicKey.toBuffer()],
      program.programId
    );

    // Initialize
    await program.methods
      .initializeReputation()
      .accounts({
        user: testUser.publicKey,
        payer: provider.wallet.publicKey,
      })
      .rpc();

    // Perform mixed updates
    const successfulCount = 7;
    const failedCount = 3;

    for (let i = 0; i < successfulCount; i++) {
      await program.methods
        .updateReputation({ successful: {} })
        .accounts({
          user: testUser.publicKey,
          authority: provider.wallet.publicKey,
        })
        .rpc();
    }

    for (let i = 0; i < failedCount; i++) {
      await program.methods
        .updateReputation({ failed: {} })
        .accounts({
          user: testUser.publicKey,
          authority: provider.wallet.publicKey,
        })
        .rpc();
    }

    // Verify final state
    const finalReputation = await program.account.reputation.fetch(testReputationPda);
    assert.equal(finalReputation.successfulTrades.toNumber(), successfulCount);
    assert.equal(finalReputation.failedTrades.toNumber(), failedCount);

    console.log("  Mixed updates applied correctly");
    console.log(`  Successful: ${successfulCount}, Failed: ${failedCount}`);
  });
});
