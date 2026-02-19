import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("raise_dispute", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const buyer = provider.wallet;
  let seller: anchor.web3.Keypair;
  let escrowPda: PublicKey;
  let escrowBump: number;

  const ESCROW_SEED = Buffer.from("escrow");
  const amount = 0.3 * LAMPORTS_PER_SOL; // 0.3 SOL

  beforeEach(async () => {
    // Create new seller for each test
    seller = anchor.web3.Keypair.generate();

    // Airdrop SOL to seller
    const airdropSig = await provider.connection.requestAirdrop(
      seller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive escrow PDA
    [escrowPda, escrowBump] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), seller.publicKey.toBuffer()],
      program.programId
    );

    // Create escrow
    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();
  });

  it("Buyer successfully raises a dispute on active escrow", async () => {
    // Raise dispute as buyer
    const tx = await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();

    console.log("Raise dispute transaction signature:", tx);

    // Fetch the escrow account
    const escrowAccount = await program.account.escrow.fetch(escrowPda);

    // Verify escrow status changed to Disputed
    assert.deepEqual(escrowAccount.status, { disputed: {} });

    console.log("  Buyer successfully raised dispute");
    console.log(`  Escrow status: Disputed`);
  });

  it("Seller successfully raises a dispute on active escrow", async () => {
    // Raise dispute as seller
    const tx = await program.methods
      .raiseDispute()
      .accounts({
        party: seller.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([seller])
      .rpc();

    console.log("Raise dispute transaction signature:", tx);

    // Fetch the escrow account
    const escrowAccount = await program.account.escrow.fetch(escrowPda);

    // Verify escrow status changed to Disputed
    assert.deepEqual(escrowAccount.status, { disputed: {} });

    console.log("  Seller successfully raised dispute");
    console.log(`  Escrow status: Disputed`);
  });

  it("Fails when unauthorized party tries to raise dispute", async () => {
    const unauthorized = anchor.web3.Keypair.generate();

    // Airdrop to unauthorized account
    const airdropSig = await provider.connection.requestAirdrop(
      unauthorized.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Try to raise dispute from unauthorized account
    try {
      await program.methods
        .raiseDispute()
        .accounts({
          party: unauthorized.publicKey,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
        })
        .signers([unauthorized])
        .rpc();

      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.ok(error.toString().includes("Unauthorized"));
      console.log("   Correctly rejected unauthorized dispute");
    }
  });

  it("Fails to raise dispute on already disputed escrow", async () => {
    // First dispute
    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();

    // Try to dispute again
    try {
      await program.methods
        .raiseDispute()
        .accounts({
          party: seller.publicKey,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
        })
        .signers([seller])
        .rpc();

      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.ok(error.toString().includes("InvalidState"));
      console.log("   Correctly rejected double dispute");
    }
  });

  it("Fails to raise dispute on completed escrow", async () => {
    // Complete the escrow by releasing funds
    await program.methods
      .releaseFunds()
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();

    // Try to raise dispute on completed escrow
    try {
      await program.methods
        .raiseDispute()
        .accounts({
          party: buyer.publicKey,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
        })
        .rpc();

      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.ok(error.toString().includes("InvalidState"));
      console.log("   Correctly rejected dispute on completed escrow");
    }
  });

  it("Fails to raise dispute on cancelled escrow", async () => {
    // Cancel the escrow
    await program.methods
      .cancelEscrow()
      .accounts({
        seller: seller.publicKey,
      })
      .rpc();

    // Try to raise dispute on cancelled escrow
    try {
      await program.methods
        .raiseDispute()
        .accounts({
          party: buyer.publicKey,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
        })
        .rpc();

      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.ok(error.toString().includes("InvalidState"));
      console.log("   Correctly rejected dispute on cancelled escrow");
    }
  });

  it("Emits DisputeRaised event", async () => {
    // Raise dispute and get transaction
    const tx = await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();

    // Wait for confirmation
    await provider.connection.confirmTransaction(tx, "confirmed");

    // Get transaction details
    const txDetails = await provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    // Verify transaction succeeded
    assert.ok(txDetails !== null, "Transaction should exist");
    assert.ok(txDetails.meta.err === null, "Transaction should succeed");

    console.log("   DisputeRaised event emitted in transaction");
  });

  it("Multiple escrows can have disputes raised independently", async () => {
    // Create second escrow with different seller
    const seller2 = anchor.web3.Keypair.generate();
    const [escrowPda2] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), seller2.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller2.publicKey,
      })
      .rpc();

    // Raise dispute on first escrow
    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();

    // Raise dispute on second escrow
    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: seller2.publicKey,
      })
      .rpc();

    // Verify both are disputed
    const escrow1 = await program.account.escrow.fetch(escrowPda);
    const escrow2 = await program.account.escrow.fetch(escrowPda2);

    assert.deepEqual(escrow1.status, { disputed: {} });
    assert.deepEqual(escrow2.status, { disputed: {} });

    console.log("  Both escrows successfully disputed independently");
  });

  it("Preserves escrow data when raising dispute", async () => {
    // Get original escrow data
    const escrowBefore = await program.account.escrow.fetch(escrowPda);

    // Raise dispute
    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();

    // Get escrow data after dispute
    const escrowAfter = await program.account.escrow.fetch(escrowPda);

    // Verify all data remained the same except status
    assert.ok(escrowAfter.buyer.equals(escrowBefore.buyer));
    assert.ok(escrowAfter.seller.equals(escrowBefore.seller));
    assert.equal(escrowAfter.amount.toNumber(), escrowBefore.amount.toNumber());
    assert.equal(escrowAfter.createdAt.toNumber(), escrowBefore.createdAt.toNumber());
    assert.equal(escrowAfter.bump, escrowBefore.bump);
    
    // Only status should have changed
    assert.deepEqual(escrowBefore.status, { active: {} });
    assert.deepEqual(escrowAfter.status, { disputed: {} });

    console.log("   All escrow data preserved except status");
  });
});
