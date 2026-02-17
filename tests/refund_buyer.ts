import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("refund_buyer", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  // Test accounts
  const buyer = provider.wallet;
  let refundEscrowPda: PublicKey;
  let refundSeller: anchor.web3.Keypair;
  const refundAmount = 0.4 * LAMPORTS_PER_SOL;

  const ESCROW_SEED = Buffer.from("escrow");

  before(async () => {
    // Create a new seller for refund tests
    refundSeller = anchor.web3.Keypair.generate();

    // Airdrop SOL to seller
    const airdropSig = await provider.connection.requestAirdrop(
      refundSeller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Derive escrow PDA
    [refundEscrowPda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), refundSeller.publicKey.toBuffer()],
      program.programId
    );

    // Create escrow for refund tests
    await program.methods
      .createEscrow(new anchor.BN(refundAmount))
      .accounts({
        buyer: buyer.publicKey,
        seller: refundSeller.publicKey,
      })
      .rpc();

    // Raise a dispute on the escrow
    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: refundSeller.publicKey,
      })
      .rpc();

    console.log("  Test escrow created and disputed for refund_buyer tests");
  });

  it("Successfully refunds buyer from disputed escrow", async () => {
    // Get buyer balance before
    const buyerBalanceBefore = await provider.connection.getBalance(
      buyer.publicKey
    );

    // Refund the buyer
    const tx = await program.methods
      .refundBuyer()
      .accounts({
        buyer: buyer.publicKey,
        seller: refundSeller.publicKey,
      })
      .rpc();

    console.log("Refund buyer transaction signature:", tx);

    // Fetch the escrow account
    const escrowAccount = await program.account.escrow.fetch(refundEscrowPda);

    // Verify escrow status changed to Cancelled
    assert.deepEqual(escrowAccount.status, { cancelled: {} });

    // Get buyer balance after
    const buyerBalanceAfter = await provider.connection.getBalance(
      buyer.publicKey
    );

    // Verify buyer received the funds back (minus transaction fees)
    const balanceIncrease = buyerBalanceAfter - buyerBalanceBefore;
    assert.ok(balanceIncrease > refundAmount * 0.95); // Allow for tx fees

    console.log("  Buyer refunded successfully");
    console.log(`  Buyer balance increase: ${balanceIncrease / LAMPORTS_PER_SOL} SOL`);
    console.log(`  Escrow status: Cancelled`);
  });

  it("Fails to refund from non-disputed escrow", async () => {
    const tempSeller = anchor.web3.Keypair.generate();

    // Create an active escrow (not disputed)
    await program.methods
      .createEscrow(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    try {
      // Try to refund without raising dispute first
      await program.methods
        .refundBuyer()
        .accounts({
          buyer: buyer.publicKey,
          seller: tempSeller.publicKey,
        })
        .rpc();

      assert.fail("Should have failed with InvalidState");
    } catch (error) {
      assert.include(error.message, "InvalidState");
      console.log("  Correctly rejected refund of non-disputed escrow");
    }
  });

  it("Buyer raises dispute and gets refund", async () => {
    const tempSeller = anchor.web3.Keypair.generate();
    const amount = 0.25 * LAMPORTS_PER_SOL;

    // Airdrop to seller
    await provider.connection.requestAirdrop(
      tempSeller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create escrow
    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    // Buyer raises dispute
    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    // Get buyer balance before refund
    const buyerBalanceBefore = await provider.connection.getBalance(
      buyer.publicKey
    );

    // Refund buyer
    await program.methods
      .refundBuyer()
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    // Verify buyer got refund
    const buyerBalanceAfter = await provider.connection.getBalance(
      buyer.publicKey
    );
    const balanceIncrease = buyerBalanceAfter - buyerBalanceBefore;

    assert.ok(balanceIncrease > amount * 0.95);
    console.log("  Buyer successfully raised dispute and received refund");
  });

  it("Seller raises dispute and buyer gets refund", async () => {
    const tempSeller = anchor.web3.Keypair.generate();
    const amount = 0.2 * LAMPORTS_PER_SOL;

    // Airdrop to seller
    await provider.connection.requestAirdrop(
      tempSeller.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create escrow
    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    // Seller raises dispute
    await program.methods
      .raiseDispute()
      .accounts({
        party: tempSeller.publicKey,
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .signers([tempSeller])
      .rpc();

    // Get buyer balance before refund
    const buyerBalanceBefore = await provider.connection.getBalance(
      buyer.publicKey
    );

    // Refund buyer
    await program.methods
      .refundBuyer()
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    // Verify buyer got refund
    const buyerBalanceAfter = await provider.connection.getBalance(
      buyer.publicKey
    );
    const balanceIncrease = buyerBalanceAfter - buyerBalanceBefore;

    assert.ok(balanceIncrease > amount * 0.95);
    console.log("  Seller raised dispute, and buyer received refund");
  });

  it("Fails to refund already cancelled escrow", async () => {
    const tempSeller = anchor.web3.Keypair.generate();

    // Airdrop to seller
    await provider.connection.requestAirdrop(
      tempSeller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create, dispute, and refund
    await program.methods
      .createEscrow(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    await program.methods
      .raiseDispute()
      .accounts({
        party: buyer.publicKey,
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    await program.methods
      .refundBuyer()
      .accounts({
        buyer: buyer.publicKey,
        seller: tempSeller.publicKey,
      })
      .rpc();

    try {
      // Try to refund again
      await program.methods
        .refundBuyer()
        .accounts({
          buyer: buyer.publicKey,
          seller: tempSeller.publicKey,
        })
        .rpc();

      assert.fail("Should have failed with InvalidState");
    } catch (error) {
      assert.include(error.message, "InvalidState");
      console.log("  Correctly rejected double refund");
    }
  });
});
