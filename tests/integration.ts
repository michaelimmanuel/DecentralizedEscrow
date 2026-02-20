import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("Full Integration Test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const CONFIG_SEED = Buffer.from("config");
  const FEE_COLLECTOR_SEED = Buffer.from("fee_collector");
  const ARBITER_SEED = Buffer.from("arbiter");
  const ESCROW_SEED = Buffer.from("escrow");
  const REPUTATION_SEED = Buffer.from("reputation");

  let admin: anchor.web3.Keypair;
  let arbiter: anchor.web3.Keypair;
  let buyer: anchor.web3.Keypair;
  let seller: anchor.web3.Keypair;
  let buyer2: anchor.web3.Keypair;
  let seller2: anchor.web3.Keypair;

  let configPda: PublicKey;
  let feeCollectorPda: PublicKey;
  let arbiterPda: PublicKey;
  let escrowPda: PublicKey;
  let escrow2Pda: PublicKey;
  let buyerReputationPda: PublicKey;
  let sellerReputationPda: PublicKey;
  let buyer2ReputationPda: PublicKey;
  let seller2ReputationPda: PublicKey;

  const FEE_BASIS_POINTS = 250; // 2.5%
  const ESCROW_AMOUNT = 5 * LAMPORTS_PER_SOL;
  const ESCROW_AMOUNT_2 = 3 * LAMPORTS_PER_SOL;

  before(async () => {
    console.log("\nSetting up full integration test environment...\n");

    // Create test accounts
    admin = anchor.web3.Keypair.generate();
    arbiter = anchor.web3.Keypair.generate();
    buyer = anchor.web3.Keypair.generate();
    seller = anchor.web3.Keypair.generate();
    buyer2 = anchor.web3.Keypair.generate();
    seller2 = anchor.web3.Keypair.generate();

    // Airdrop SOL to all accounts
    const airdropAmount = 10 * LAMPORTS_PER_SOL;
    const accounts = [admin, arbiter, buyer, seller, buyer2, seller2];
    
    for (const account of accounts) {
      const airdrop = await provider.connection.requestAirdrop(
        account.publicKey,
        airdropAmount
      );
      await provider.connection.confirmTransaction(airdrop);
    }

    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      program.programId
    );

    [feeCollectorPda] = PublicKey.findProgramAddressSync(
      [FEE_COLLECTOR_SEED],
      program.programId
    );

    [arbiterPda] = PublicKey.findProgramAddressSync(
      [ARBITER_SEED, arbiter.publicKey.toBuffer()],
      program.programId
    );

    [escrowPda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer.publicKey.toBuffer(), seller.publicKey.toBuffer()],
      program.programId
    );

    [escrow2Pda] = PublicKey.findProgramAddressSync(
      [ESCROW_SEED, buyer2.publicKey.toBuffer(), seller2.publicKey.toBuffer()],
      program.programId
    );

    [buyerReputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, buyer.publicKey.toBuffer()],
      program.programId
    );

    [sellerReputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, seller.publicKey.toBuffer()],
      program.programId
    );

    [buyer2ReputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, buyer2.publicKey.toBuffer()],
      program.programId
    );

    [seller2ReputationPda] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, seller2.publicKey.toBuffer()],
      program.programId
    );

    console.log("All test accounts funded and PDAs derived");
    console.log(`   Admin: ${admin.publicKey.toString()}`);
    console.log(`   Arbiter: ${arbiter.publicKey.toString()}`);
    console.log(`   Buyer 1: ${buyer.publicKey.toString()}`);
    console.log(`   Seller 1: ${seller.publicKey.toString()}`);
    console.log(`   Buyer 2: ${buyer2.publicKey.toString()}`);
    console.log(`   Seller 2: ${seller2.publicKey.toString()}`);
    console.log(`   Config PDA: ${configPda.toString()}`);
    console.log(`   Fee Collector PDA: ${feeCollectorPda.toString()}\n`);
  });

  it("Step 1: Initialize platform configuration", async () => {
    console.log("Initializing platform configuration...");

    await program.methods
      .initializeConfig(FEE_BASIS_POINTS)
      .accounts({
        admin: admin.publicKey,
        feeCollector: feeCollectorPda,
      } as any)
      .signers([admin])
      .rpc();

    const config = await program.account.config.fetch(configPda);

    assert.ok(config.admin.equals(admin.publicKey));
    assert.equal(config.feeBasisPoints, FEE_BASIS_POINTS);

    console.log(`Config initialized with ${FEE_BASIS_POINTS / 100}% platform fee\n`);
  });

  it("Step 2: Add arbiter to the platform", async () => {
    console.log("Adding arbiter to the platform...");

    await program.methods
      .addArbiter()
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        arbiter: arbiter.publicKey,
      } as any)
      .signers([admin])
      .rpc();

    const arbiterAccount = await program.account.arbiter.fetch(arbiterPda);

    assert.ok(arbiterAccount.arbiter.equals(arbiter.publicKey));
    assert.ok(arbiterAccount.isActive);

    console.log("Arbiter added and activated\n");
  });

  it("Step 3: Initialize reputation accounts", async () => {
    console.log("Initializing reputation accounts...");

    // Initialize buyer reputation
    await program.methods
      .initializeReputation()
      .accounts({
        reputation: buyerReputationPda,
        user: buyer.publicKey,
        payer: buyer.publicKey,
      } as any)
      .signers([buyer])
      .rpc();

    // Initialize seller reputation
    await program.methods
      .initializeReputation()
      .accounts({
        reputation: sellerReputationPda,
        user: seller.publicKey,
        payer: seller.publicKey,
      } as any)
      .signers([seller])
      .rpc();

    // Initialize buyer2 reputation
    await program.methods
      .initializeReputation()
      .accounts({
        reputation: buyer2ReputationPda,
        user: buyer2.publicKey,
        payer: buyer2.publicKey,
      } as any)
      .signers([buyer2])
      .rpc();

    // Initialize seller2 reputation
    await program.methods
      .initializeReputation()
      .accounts({
        reputation: seller2ReputationPda,
        user: seller2.publicKey,
        payer: seller2.publicKey,
      } as any)
      .signers([seller2])
      .rpc();

    const buyerRep = await program.account.reputation.fetch(buyerReputationPda);
    const sellerRep = await program.account.reputation.fetch(sellerReputationPda);

    assert.equal(buyerRep.successfulTrades.toNumber(), 0);
    assert.equal(buyerRep.failedTrades.toNumber(), 0);
    assert.equal(sellerRep.successfulTrades.toNumber(), 0);
    assert.equal(sellerRep.failedTrades.toNumber(), 0);

    console.log("All reputation accounts initialized\n");
  });

  it("Step 4: Create first escrow (Buyer 1 → Seller 1)", async () => {
    console.log(`Creating escrow for ${ESCROW_AMOUNT / LAMPORTS_PER_SOL} SOL...`);

    const initialBuyerBalance = await provider.connection.getBalance(buyer.publicKey);

    await program.methods
      .createEscrow(new anchor.BN(ESCROW_AMOUNT))
      .accounts({
        escrow: escrowPda,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      } as any)
      .signers([buyer])
      .rpc();

    const escrow = await program.account.escrow.fetch(escrowPda);
    const finalBuyerBalance = await provider.connection.getBalance(buyer.publicKey);

    assert.ok(escrow.buyer.equals(buyer.publicKey));
    assert.ok(escrow.seller.equals(seller.publicKey));
    assert.equal(escrow.amount.toNumber(), ESCROW_AMOUNT);
    assert.deepEqual(escrow.status, { active: {} });
    assert.isTrue(initialBuyerBalance - finalBuyerBalance >= ESCROW_AMOUNT);

    console.log("Escrow 1 created successfully\n");
  });

  it("Step 5: Create second escrow (Buyer 2 → Seller 2)", async () => {
    console.log(`Creating second escrow for ${ESCROW_AMOUNT_2 / LAMPORTS_PER_SOL} SOL...`);

    await program.methods
      .createEscrow(new anchor.BN(ESCROW_AMOUNT_2))
      .accounts({
        escrow: escrow2Pda,
        buyer: buyer2.publicKey,
        seller: seller2.publicKey,
      } as any)
      .signers([buyer2])
      .rpc();

    const escrow2 = await program.account.escrow.fetch(escrow2Pda);

    assert.ok(escrow2.buyer.equals(buyer2.publicKey));
    assert.ok(escrow2.seller.equals(seller2.publicKey));
    assert.equal(escrow2.amount.toNumber(), ESCROW_AMOUNT_2);

    console.log("Escrow 2 created successfully\n");
  });

  it("Step 6: Release funds from first escrow (with platform fee)", async () => {
    console.log("Buyer 1 releasing funds to Seller 1...");

    const initialSellerBalance = await provider.connection.getBalance(seller.publicKey);
    const initialFeeCollectorBalance = await provider.connection.getBalance(feeCollectorPda);

    await program.methods
      .releaseFunds()
      .accounts({
        escrow: escrowPda,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        buyerReputation: buyerReputationPda,
        sellerReputation: sellerReputationPda,
        config: configPda,
        feeCollector: feeCollectorPda,
      } as any)
      .signers([buyer])
      .rpc();

    const finalSellerBalance = await provider.connection.getBalance(seller.publicKey);
    const finalFeeCollectorBalance = await provider.connection.getBalance(feeCollectorPda);
    const escrow = await program.account.escrow.fetch(escrowPda);

    // Calculate expected fee and seller amount
    const expectedFee = (ESCROW_AMOUNT * FEE_BASIS_POINTS) / 10_000;
    const expectedSellerAmount = ESCROW_AMOUNT - expectedFee;

    assert.deepEqual(escrow.status, { completed: {} });
    assert.equal(finalSellerBalance - initialSellerBalance, expectedSellerAmount);
    assert.equal(finalFeeCollectorBalance - initialFeeCollectorBalance, expectedFee);

    // Check reputation updates
    const buyerRep = await program.account.reputation.fetch(buyerReputationPda);
    const sellerRep = await program.account.reputation.fetch(sellerReputationPda);

    assert.equal(buyerRep.successfulTrades.toNumber(), 1);
    assert.equal(sellerRep.successfulTrades.toNumber(), 1);

    console.log(`Funds released: Seller received ${expectedSellerAmount / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Platform fee collected: ${expectedFee / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Buyer successful trades: ${buyerRep.successfulTrades}, Seller successful trades: ${sellerRep.successfulTrades}\n`);
  });

  it("Step 7: Raise dispute on second escrow", async () => {
    console.log("Buyer 2 raising a dispute...");

    await program.methods
      .raiseDispute()
      .accounts({
        escrow: escrow2Pda,
        party: buyer2.publicKey,
        buyer: buyer2.publicKey,
        seller: seller2.publicKey,
      } as any)
      .signers([buyer2])
      .rpc();

    const escrow2 = await program.account.escrow.fetch(escrow2Pda);

    assert.deepEqual(escrow2.status, { disputed: {} });

    console.log("Dispute raised on Escrow 2\n");
  });

  it("Step 8: Arbiter resolves dispute in favor of buyer", async () => {
    console.log("Arbiter resolving dispute...");

    const initialBuyer2Balance = await provider.connection.getBalance(buyer2.publicKey);

    await program.methods
      .resolveDispute({ favorBuyer: {} })
      .accounts({
        escrow: escrow2Pda,
        arbiter: arbiter.publicKey,
        arbiterAccount: arbiterPda,
        buyer: buyer2.publicKey,
        seller: seller2.publicKey,
        buyerReputation: buyer2ReputationPda,
        sellerReputation: seller2ReputationPda,
      } as any)
      .signers([arbiter])
      .rpc();

    const finalBuyer2Balance = await provider.connection.getBalance(buyer2.publicKey);
    const escrow2 = await program.account.escrow.fetch(escrow2Pda);

    // Check buyer got refund
    assert.equal(finalBuyer2Balance - initialBuyer2Balance, ESCROW_AMOUNT_2);
    assert.deepEqual(escrow2.status, { completed: {} });

    // Check reputation updates (buyer gets +1 successful, seller gets +1 failed)
    const buyer2Rep = await program.account.reputation.fetch(buyer2ReputationPda);
    const seller2Rep = await program.account.reputation.fetch(seller2ReputationPda);

    assert.equal(buyer2Rep.successfulTrades.toNumber(), 1);
    assert.equal(seller2Rep.failedTrades.toNumber(), 1);

    console.log(`Dispute resolved: Buyer 2 refunded ${ESCROW_AMOUNT_2 / LAMPORTS_PER_SOL} SOL`);
    console.log(`   Buyer 2 successful trades: ${buyer2Rep.successfulTrades}, Seller 2 failed trades: ${seller2Rep.failedTrades}\n`);
  });

  it("Step 9: Admin withdraws accumulated platform fees", async () => {
    console.log("Admin withdrawing platform fees...");

    const feeCollectorBalance = await provider.connection.getBalance(feeCollectorPda);
    const initialAdminBalance = await provider.connection.getBalance(admin.publicKey);

    // Calculate expected fee from first escrow
    const expectedFee = (ESCROW_AMOUNT * FEE_BASIS_POINTS) / 10_000;

    // Withdraw all fees (leaving rent-exempt amount)
    const rentExemption = await provider.connection.getMinimumBalanceForRentExemption(0);
    const withdrawAmount = feeCollectorBalance - rentExemption;

    await program.methods
      .withdrawFees(new anchor.BN(withdrawAmount))
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        feeCollector: feeCollectorPda,
      } as any)
      .signers([admin])
      .rpc();

    const finalAdminBalance = await provider.connection.getBalance(admin.publicKey);
    const finalFeeCollectorBalance = await provider.connection.getBalance(feeCollectorPda);

    assert.equal(finalFeeCollectorBalance, rentExemption);
    assert.isTrue(finalAdminBalance > initialAdminBalance);

    console.log(`Admin withdrew ${withdrawAmount / LAMPORTS_PER_SOL} SOL in fees`);
    console.log(`   Fee collector balance (rent-exempt): ${finalFeeCollectorBalance / LAMPORTS_PER_SOL} SOL\n`);
  });

  it("Step 10: Verify reputation updates", async () => {
    console.log("Verifying reputation states...");

    const buyerRep = await program.account.reputation.fetch(buyerReputationPda);
    const seller2Rep = await program.account.reputation.fetch(seller2ReputationPda);

    // Buyer should have 1 successful trade from Step 6
    assert.equal(buyerRep.successfulTrades.toNumber(), 1);
    assert.equal(buyerRep.failedTrades.toNumber(), 0);

    // Seller 2 should have 1 failed trade from Step 8
    assert.equal(seller2Rep.successfulTrades.toNumber(), 0);
    assert.equal(seller2Rep.failedTrades.toNumber(), 1);

    console.log(`Reputation verified: Buyer 1 = ${buyerRep.successfulTrades} successful, Seller 2 = ${seller2Rep.failedTrades} failed\n`);
  });

  it("Step 11: Remove arbiter from platform", async () => {
    console.log("Admin removing arbiter...");

    await program.methods
      .removeArbiter()
      .accounts({
        config: configPda,
        admin: admin.publicKey,
        arbiter: arbiter.publicKey,
      } as any)
      .signers([admin])
      .rpc();

    const arbiterAccount = await program.account.arbiter.fetch(arbiterPda);

    assert.isFalse(arbiterAccount.isActive);

    console.log("Arbiter deactivated\n");
  });

  it("Step 12: Verify final system state", async () => {
    console.log("Verifying final system state...");

    // Check config
    const config = await program.account.config.fetch(configPda);
    assert.ok(config.admin.equals(admin.publicKey));
    assert.equal(config.feeBasisPoints, FEE_BASIS_POINTS);

    // Check escrow states
    const escrow1 = await program.account.escrow.fetch(escrowPda);
    const escrow2 = await program.account.escrow.fetch(escrow2Pda);
    assert.deepEqual(escrow1.status, { completed: {} });
    assert.deepEqual(escrow2.status, { completed: {} });

    // Check reputation accounts
    const buyerRep = await program.account.reputation.fetch(buyerReputationPda);
    const sellerRep = await program.account.reputation.fetch(sellerReputationPda);
    const buyer2Rep = await program.account.reputation.fetch(buyer2ReputationPda);
    const seller2Rep = await program.account.reputation.fetch(seller2ReputationPda);

    console.log("\nFinal Reputation Stats:");
    console.log(`   Buyer 1: ${buyerRep.successfulTrades} successful, ${buyerRep.failedTrades} failed`);
    console.log(`   Seller 1: ${sellerRep.successfulTrades} successful, ${sellerRep.failedTrades} failed`);
    console.log(`   Buyer 2: ${buyer2Rep.successfulTrades} successful, ${buyer2Rep.failedTrades} failed`);
    console.log(`   Seller 2: ${seller2Rep.successfulTrades} successful, ${seller2Rep.failedTrades} failed`);

    console.log("\nAll system components verified successfully");
    console.log("\nFULL INTEGRATION TEST COMPLETED!\n");
  });
});
