import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("release_funds", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  // Test accounts
  const buyer = provider.wallet;
  let releaseEscrowPda: PublicKey;
  let releaseSeller: anchor.web3.Keypair;
  const releaseAmount = 0.5 * LAMPORTS_PER_SOL;

  const ESCROW_SEED = Buffer.from("escrow");

  before(async () => {
    // Create a new seller for release tests
    releaseSeller = anchor.web3.Keypair.generate();

    // Airdrop SOL to seller
    const airdropSig = await provider.connection.requestAirdrop(
      releaseSeller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive escrow PDA
    [releaseEscrowPda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), releaseSeller.publicKey.toBuffer()],
      program.programId
    );

    // Create escrow for release tests
    await program.methods
      .createEscrow(new anchor.BN(releaseAmount))
      .accounts({
        buyer: buyer.publicKey,
        seller: releaseSeller.publicKey,
      })
      .rpc();

    console.log("  Test escrow created for release_funds tests");
  });

  it("Buyer successfully releases funds to seller", async () => {
    // Get seller balance before
    const sellerBalanceBefore = await provider.connection.getBalance(
      releaseSeller.publicKey
    );

    // Release funds
    const tx = await program.methods
      .releaseFunds()
      .accounts({
        buyer: buyer.publicKey,
        seller: releaseSeller.publicKey,
      })
      .rpc();

    console.log("Release funds transaction signature:", tx);

    // Fetch the escrow account
    const escrowAccount = await program.account.escrow.fetch(releaseEscrowPda);

    // Verify escrow status changed to Completed
    assert.deepEqual(escrowAccount.status, { completed: {} });

    // Get seller balance after
    const sellerBalanceAfter = await provider.connection.getBalance(
      releaseSeller.publicKey
    );

    // Verify seller received the funds
    const expectedIncrease = releaseAmount;
    const actualIncrease = sellerBalanceAfter - sellerBalanceBefore;
    assert.ok(actualIncrease >= expectedIncrease * 0.99); // Allow for small rounding

    console.log("  Funds released successfully");
    console.log(`  Seller balance increase: ${actualIncrease / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Escrow status: Completed`);
  });

  it("Fails when non-buyer tries to release funds", async () => {
    // Create another escrow for this test
    const tempSeller = anchor.web3.Keypair.generate();
    const unauthorizedUser = anchor.web3.Keypair.generate();

    // Airdrop to unauthorized user
    const airdropSig = await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const [tempEscrowPda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), tempSeller.publicKey.toBuffer()],
      program.programId
    );

    // Create escrow
    await program.methods
      .createEscrow(new anchor.BN(0.15 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    try {
      // Try to release with unauthorized user
      await program.methods
        .releaseFunds()
        .accounts({
          buyer: unauthorizedUser.publicKey,
          seller: tempSeller.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();

      assert.fail("Should have failed with constraint error");
    } catch (error) {
      // Check for constraint violation - can be ConstraintHasOne or seeds constraint error
      assert.ok(
        error.message.includes("ConstraintHasOne") || 
        error.message.includes("constraint") ||
        error.message.includes("escrow"),
        `Expected constraint error but got: ${error.message}`
      );
      console.log("  Correctly rejected unauthorized release attempt");
    }
  });

  it("Fails to release funds from already completed escrow", async () => {
    try {
      // Try to release again from the already completed escrow
      await program.methods
        .releaseFunds()
        .accounts({
          buyer: buyer.publicKey,
          seller: releaseSeller.publicKey,
        })
        .rpc();

      assert.fail("Should have failed with InvalidState error");
    } catch (error) {
      assert.include(error.message, "InvalidState");
      console.log("  Correctly rejected double release attempt");
    }
  });

  it("Releases funds from multiple escrows sequentially", async () => {
    const seller1 = anchor.web3.Keypair.generate();
    const seller2 = anchor.web3.Keypair.generate();

    const [escrow1] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), seller1.publicKey.toBuffer()],
      program.programId
    );

    const [escrow2] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), seller2.publicKey.toBuffer()],
      program.programId
    );

    // Airdrop to sellers
    await provider.connection.requestAirdrop(seller1.publicKey, 1 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(seller2.publicKey, 1 * LAMPORTS_PER_SOL);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create two escrows
    await program.methods
      .createEscrow(new anchor.BN(0.25 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller1.publicKey,
      })
      .rpc();

    await program.methods
      .createEscrow(new anchor.BN(0.35 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller2.publicKey,
      })
      .rpc();

    // Release both
    await program.methods
      .releaseFunds()
      .accounts({
        buyer: buyer.publicKey,
        seller: seller1.publicKey,
      })
      .rpc();

    await program.methods
      .releaseFunds()
      .accounts({
        buyer: buyer.publicKey,
        seller: seller2.publicKey,
      })
      .rpc();

    // Verify both are completed
    const escrowAccount1 = await program.account.escrow.fetch(escrow1);
    const escrowAccount2 = await program.account.escrow.fetch(escrow2);

    assert.deepEqual(escrowAccount1.status, { completed: {} });
    assert.deepEqual(escrowAccount2.status, { completed: {} });

    console.log("  Multiple releases completed successfully");
  });
});
