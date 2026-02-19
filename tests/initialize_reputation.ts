import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("initialize_reputation", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const REPUTATION_SEED = Buffer.from("reputation");

  it("Initializes reputation for a user", async () => {
    const user = anchor.web3.Keypair.generate();
    const payer = provider.wallet;

    // Airdrop SOL to user for testing
    const airdropSig = await provider.connection.requestAirdrop(
      user.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive reputation PDA
    const [reputationPda, reputationBump] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, user.publicKey.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .initializeReputation()
      .accounts({
        user: user.publicKey,
        payer: payer.publicKey,
      })
      .rpc();

    console.log("Initialize reputation transaction signature:", tx);

    // Fetch the reputation account
    const reputationAccount = await program.account.reputation.fetch(reputationPda);

    // Verify reputation account data
    assert.ok(reputationAccount.user.equals(user.publicKey));
    assert.equal(reputationAccount.successfulTrades.toNumber(), 0);
    assert.equal(reputationAccount.failedTrades.toNumber(), 0);

    console.log("  Reputation initialized successfully");
    console.log(`  User: ${reputationAccount.user.toString()}`);
    console.log(`  Successful Trades: ${reputationAccount.successfulTrades.toNumber()}`);
    console.log(`  Failed Trades: ${reputationAccount.failedTrades.toNumber()}`);
  });

  it("Initializes reputation for wallet as payer and user", async () => {
    const user = provider.wallet;

    // Derive reputation PDA
    const [reputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, user.publicKey.toBuffer()],
      program.programId
    );

    const tx = await program.methods
      .initializeReputation()
      .accounts({
        user: user.publicKey,
        payer: user.publicKey,
      })
      .rpc();

    console.log("Initialize reputation transaction signature:", tx);

    // Fetch the reputation account
    const reputationAccount = await program.account.reputation.fetch(reputationPda);

    // Verify reputation account data
    assert.ok(reputationAccount.user.equals(user.publicKey));
    assert.equal(reputationAccount.successfulTrades.toNumber(), 0);
    assert.equal(reputationAccount.failedTrades.toNumber(), 0);

    console.log("  Reputation initialized for wallet");
  });

  it("Cannot initialize reputation twice for same user", async () => {
    const user = anchor.web3.Keypair.generate();
    const payer = provider.wallet;

    // Airdrop SOL to user for testing
    const airdropSig = await provider.connection.requestAirdrop(
      user.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Initialize reputation first time
    await program.methods
      .initializeReputation()
      .accounts({
        user: user.publicKey,
        payer: payer.publicKey,
      })
      .rpc();

    // Try to initialize again - should fail
    try {
      await program.methods
        .initializeReputation()
        .accounts({
          user: user.publicKey,
          payer: payer.publicKey,
        })
        .rpc();
      
      assert.fail("Expected error when initializing reputation twice");
    } catch (error) {
      // Expected to fail - account already exists
      expect(error.message).to.include("already in use");
      console.log("  Correctly prevented duplicate reputation initialization");
    }
  });

  it("Initializes reputation for multiple users", async () => {
    const users = [
      anchor.web3.Keypair.generate(),
      anchor.web3.Keypair.generate(),
      anchor.web3.Keypair.generate(),
    ];
    const payer = provider.wallet;

    for (const user of users) {
      // Airdrop SOL to each user
      const airdropSig = await provider.connection.requestAirdrop(
        user.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(airdropSig);

      // Derive reputation PDA
      const [reputationPda] = PublicKey.findProgramAddressSync(
        [REPUTATION_SEED, user.publicKey.toBuffer()],
        program.programId
      );

      // Initialize reputation
      await program.methods
        .initializeReputation()
        .accounts({
          user: user.publicKey,
          payer: payer.publicKey,
        })
        .rpc();

      // Verify the account was created
      const reputationAccount = await program.account.reputation.fetch(reputationPda);
      assert.ok(reputationAccount.user.equals(user.publicKey));
      assert.equal(reputationAccount.successfulTrades.toNumber(), 0);
      assert.equal(reputationAccount.failedTrades.toNumber(), 0);
    }

    console.log(`  Successfully initialized reputation for ${users.length} users`);
  });

  it("Can derive reputation PDA for any user", async () => {
    const user1 = anchor.web3.Keypair.generate();
    const user2 = anchor.web3.Keypair.generate();

    // Derive reputation PDAs
    const [reputationPda1] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, user1.publicKey.toBuffer()],
      program.programId
    );

    const [reputationPda2] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, user2.publicKey.toBuffer()],
      program.programId
    );

    // PDAs should be different for different users
    assert.notEqual(reputationPda1.toString(), reputationPda2.toString());
    
    console.log("  Reputation PDAs are unique per user");
  });
});
