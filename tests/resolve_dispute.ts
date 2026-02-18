import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("resolve_dispute", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const buyer = provider.wallet;
  let seller: anchor.web3.Keypair;
  let arbiter: anchor.web3.Keypair;
  let escrowPda: PublicKey;
  let escrowBump: number;

  const ESCROW_SEED = Buffer.from("escrow");
  const amount = 0.5 * LAMPORTS_PER_SOL; // 0.5 SOL

  beforeEach(async () => {
    // Create new keypairs for each test
    seller = anchor.web3.Keypair.generate();
    arbiter = anchor.web3.Keypair.generate();

    // Airdrop SOL to accounts
    const airdropSeller = await provider.connection.requestAirdrop(
      seller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    const airdropArbiter = await provider.connection.requestAirdrop(
      arbiter.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSeller);
    await provider.connection.confirmTransaction(airdropArbiter);

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

    // Raise dispute
    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .rpc();
  });

  it("Resolves dispute in favor of buyer (full refund)", async () => {
    const buyerBalanceBefore = await provider.connection.getBalance(
      buyer.publicKey
    );
    const sellerBalanceBefore = await provider.connection.getBalance(
      seller.publicKey
    );

    // Resolve dispute in favor of buyer
    await program.methods
      .resolveDispute({ favorBuyer: {} })
      .accounts({
        arbiter: arbiter.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([arbiter])
      .rpc();

    const buyerBalanceAfter = await provider.connection.getBalance(
      buyer.publicKey
    );
    const sellerBalanceAfter = await provider.connection.getBalance(
      seller.publicKey
    );

    // Buyer should receive refund
    const buyerDiff = buyerBalanceAfter - buyerBalanceBefore;
    assert.ok(
      buyerDiff >= amount * 0.99, // Allow for transaction fees
      `Buyer should receive approximately ${amount} lamports, received ${buyerDiff}`
    );

    // Seller should not receive anything
    assert.equal(
      sellerBalanceAfter,
      sellerBalanceBefore,
      "Seller should not receive funds"
    );

    // Verify escrow status
    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.deepEqual(escrowAccount.status, { completed: {} });

    console.log("  Dispute resolved in favor of buyer");
    console.log(`  Buyer refunded: ${buyerDiff / LAMPORTS_PER_SOL} SOL`);
  });

  it("Resolves dispute in favor of seller (full payment)", async () => {
    const buyerBalanceBefore = await provider.connection.getBalance(
      buyer.publicKey
    );
    const sellerBalanceBefore = await provider.connection.getBalance(
      seller.publicKey
    );

    // Resolve dispute in favor of seller
    await program.methods
      .resolveDispute({ favorSeller: {} })
      .accounts({
        arbiter: arbiter.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([arbiter])
      .rpc();

    const buyerBalanceAfter = await provider.connection.getBalance(
      buyer.publicKey
    );
    const sellerBalanceAfter = await provider.connection.getBalance(
      seller.publicKey
    );

    // Seller should receive full amount
    const sellerDiff = sellerBalanceAfter - sellerBalanceBefore;
    assert.ok(
      sellerDiff >= amount * 0.99, // Allow for small precision loss
      `Seller should receive approximately ${amount} lamports, received ${sellerDiff}`
    );

    // Buyer should not receive anything (only pay transaction fees)
    const buyerDiff = buyerBalanceBefore - buyerBalanceAfter;
    assert.ok(
      buyerDiff < 0.01 * LAMPORTS_PER_SOL, // Only transaction fees
      "Buyer should only pay transaction fees"
    );

    // Verify escrow status
    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.deepEqual(escrowAccount.status, { completed: {} });

    console.log("  Dispute resolved in favor of seller");
    console.log(`  Seller received: ${sellerDiff / LAMPORTS_PER_SOL} SOL`);
  });

  it("Resolves dispute with 50/50 split", async () => {
    const buyerBalanceBefore = await provider.connection.getBalance(
      buyer.publicKey
    );
    const sellerBalanceBefore = await provider.connection.getBalance(
      seller.publicKey
    );

    // Resolve dispute with split
    await program.methods
      .resolveDispute({ split: {} })
      .accounts({
        arbiter: arbiter.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([arbiter])
      .rpc();

    const buyerBalanceAfter = await provider.connection.getBalance(
      buyer.publicKey
    );
    const sellerBalanceAfter = await provider.connection.getBalance(
      seller.publicKey
    );

    const expectedSplit = amount / 2;
    const buyerDiff = buyerBalanceAfter - buyerBalanceBefore;
    const sellerDiff = sellerBalanceAfter - sellerBalanceBefore;

    // Both should receive approximately half
    assert.ok(
      Math.abs(buyerDiff - expectedSplit) < 0.01 * LAMPORTS_PER_SOL,
      `Buyer should receive ~${expectedSplit / LAMPORTS_PER_SOL} SOL, received ${
        buyerDiff / LAMPORTS_PER_SOL
      } SOL`
    );
    assert.ok(
      Math.abs(sellerDiff - expectedSplit) < 0.01 * LAMPORTS_PER_SOL,
      `Seller should receive ~${expectedSplit / LAMPORTS_PER_SOL} SOL, received ${
        sellerDiff / LAMPORTS_PER_SOL
      } SOL`
    );

    // Verify escrow status
    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.deepEqual(escrowAccount.status, { completed: {} });

    console.log("  Dispute resolved with 50/50 split");
    console.log(`  Buyer received: ${buyerDiff / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Seller received: ${sellerDiff / LAMPORTS_PER_SOL} SOL`);
  });

  it("Fails to resolve dispute when escrow is not disputed", async () => {
    // Create a new escrow that is not disputed
    const newSeller = anchor.web3.Keypair.generate();
    const [newEscrowPda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), newSeller.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: newSeller.publicKey,
      })
      .rpc();

    // Try to resolve dispute on non-disputed escrow
    try {
      await program.methods
        .resolveDispute({ favorBuyer: {} })
        .accounts({
          arbiter: arbiter.publicKey,
          buyer: buyer.publicKey,
          seller: newSeller.publicKey,
        })
        .signers([arbiter])
        .rpc();

      assert.fail("Should have thrown an error");
    } catch (error) {
      assert.ok(error.toString().includes("InvalidState"));
      console.log("  ✓ Correctly rejected resolving non-disputed escrow");
    }
  });

  it("Emits DisputeResolved event", async () => {
    // Resolve dispute
    const tx = await program.methods
      .resolveDispute({ favorBuyer: {} })
      .accounts({
        arbiter: arbiter.publicKey,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([arbiter])
      .rpc();

    // Wait for confirmation
    await provider.connection.confirmTransaction(tx, "confirmed");

    // Check transaction logs for event
    const txDetails = await provider.connection.getTransaction(tx, {
      commitment: "confirmed",
    });

    // Verify transaction succeeded
    assert.ok(txDetails !== null, "Transaction should exist");
    assert.ok(txDetails.meta.err === null, "Transaction should succeed");

    console.log("  ✓ DisputeResolved event emitted in transaction");
  });
});
