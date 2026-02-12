import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("cancel_escrow", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  // Test accounts
  const buyer = provider.wallet;
  let cancelEscrowPda: PublicKey;
  let cancelSeller: anchor.web3.Keypair;
  const cancelAmount = 0.3 * LAMPORTS_PER_SOL;

  const ESCROW_SEED = Buffer.from("escrow");

  before(async () => {
    // Create a new seller for cancel tests
    cancelSeller = anchor.web3.Keypair.generate();

    // Airdrop SOL to seller
    const airdropSig = await provider.connection.requestAirdrop(
      cancelSeller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive escrow PDA
    [cancelEscrowPda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), cancelSeller.publicKey.toBuffer()],
      program.programId
    );

    // Create escrow for cancel tests
    await program.methods
      .createEscrow(new anchor.BN(cancelAmount))
      .accounts({
        buyer: buyer.publicKey,
        seller: cancelSeller.publicKey,
      })
      .rpc();

    console.log("  Test escrow created for cancel_escrow tests");
  });

  it("Buyer successfully cancels escrow and gets refund", async () => {
    // Get buyer balance before
    const buyerBalanceBefore = await provider.connection.getBalance(
      buyer.publicKey
    );

    // Cancel the escrow
    const tx = await program.methods
      .cancelEscrow()
      .accounts({
        seller: cancelSeller.publicKey,
      })
      .rpc();

    console.log("Cancel escrow transaction signature:", tx);

    // Fetch the escrow account
    const escrowAccount = await program.account.escrow.fetch(cancelEscrowPda);

    // Verify escrow status changed to Cancelled
    assert.deepEqual(escrowAccount.status, { cancelled: {} });

    // Get buyer balance after
    const buyerBalanceAfter = await provider.connection.getBalance(
      buyer.publicKey
    );

    // Verify buyer got their money back (minus transaction fees)
    const balanceIncrease = buyerBalanceAfter - buyerBalanceBefore;
    assert.ok(balanceIncrease > cancelAmount * 0.95); // Allow for tx fees

    console.log("  Escrow cancelled successfully");
    console.log(`  Buyer balance increase: ${balanceIncrease / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Escrow status: Cancelled`);
  });

  it("Fails when non-buyer tries to cancel", async () => {
    const tempSeller = anchor.web3.Keypair.generate();
    const unauthorizedUser = anchor.web3.Keypair.generate();

    // Airdrop to unauthorized user
    const airdropSig = await provider.connection.requestAirdrop(
      unauthorizedUser.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create test escrow
    await program.methods
      .createEscrow(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    try {
      // Try to cancel with unauthorized user
      await program.methods
        .cancelEscrow()
        .accounts({
          seller: tempSeller.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();

      assert.fail("Should have failed");
    } catch (error) {
      assert.ok(
        error.message.includes("constraint") || 
        error.message.includes("escrow") ||
        error.message.includes("ConstraintHasOne") ||
        error.message.includes("unknown signer"),
        `Expected constraint error but got: ${error.message}`
      );
      console.log("  Correctly rejected unauthorized cancel");
    }
  });

  it("Fails to cancel already completed escrow", async () => {
    const tempSeller = anchor.web3.Keypair.generate();
    
    // Airdrop to seller
    await provider.connection.requestAirdrop(
      tempSeller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create and immediately release escrow
    await program.methods
      .createEscrow(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    await program.methods
      .releaseFunds()
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    try {
      // Try to cancel completed escrow
      await program.methods
        .cancelEscrow()
        .accounts({
          seller: tempSeller.publicKey,
        })
        .rpc();

      assert.fail("Should have failed with InvalidState");
    } catch (error) {
      assert.include(error.message, "InvalidState");
      console.log("  Correctly rejected cancel of completed escrow");
    }
  });

  it("Fails to cancel already cancelled escrow", async () => {
    const tempSeller = anchor.web3.Keypair.generate();
    
    // Create escrow
    await program.methods
      .createEscrow(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    // Cancel it once
    await program.methods
      .cancelEscrow()
      .accounts({
        seller: tempSeller.publicKey,
      })
      .rpc();

    try {
      // Try to cancel again
      await program.methods
        .cancelEscrow()
        .accounts({
          seller: tempSeller.publicKey,
        })
        .rpc();

      assert.fail("Should have failed with InvalidState");
    } catch (error) {
      assert.include(error.message, "InvalidState");
      console.log("  Correctly rejected double cancellation");
    }
  });

  it("Cancels multiple escrows independently", async () => {
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

    // Create two escrows
    await program.methods
      .createEscrow(new anchor.BN(0.15 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller1.publicKey,
      })
      .rpc();

    await program.methods
      .createEscrow(new anchor.BN(0.25 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller2.publicKey,
      })
      .rpc();

    // Cancel both
    await program.methods
      .cancelEscrow()
      .accounts({
        seller: seller1.publicKey,
      })
      .rpc();

    await program.methods
      .cancelEscrow()
      .accounts({
        seller: seller2.publicKey,
      })
      .rpc();

    // Verify both are cancelled
    const escrowAccount1 = await program.account.escrow.fetch(escrow1);
    const escrowAccount2 = await program.account.escrow.fetch(escrow2);

    assert.deepEqual(escrowAccount1.status, { cancelled: {} });
    assert.deepEqual(escrowAccount2.status, { cancelled: {} });

    console.log("  Multiple escrows cancelled successfully");
  });
});
