import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("arbiter_management", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  const CONFIG_SEED = Buffer.from("config");
  const ARBITER_SEED = Buffer.from("arbiter");
  const ESCROW_SEED = Buffer.from("escrow");

  let admin: anchor.web3.Keypair;
  let feeCollector: anchor.web3.Keypair;
  let configPda: PublicKey;
  let arbiter1: anchor.web3.Keypair;
  let arbiter2: anchor.web3.Keypair;
  let arbiter1Pda: PublicKey;
  let arbiter2Pda: PublicKey;

  before(async () => {
    // Create test accounts
    admin = anchor.web3.Keypair.generate();
    feeCollector = anchor.web3.Keypair.generate();
    arbiter1 = anchor.web3.Keypair.generate();
    arbiter2 = anchor.web3.Keypair.generate();

    // Airdrop SOL to admin
    const airdrop = await provider.connection.requestAirdrop(
      admin.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop);

    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED],
      program.programId
    );

    [arbiter1Pda] = PublicKey.findProgramAddressSync(
      [ARBITER_SEED, arbiter1.publicKey.toBuffer()],
      program.programId
    );

    [arbiter2Pda] = PublicKey.findProgramAddressSync(
      [ARBITER_SEED, arbiter2.publicKey.toBuffer()],
      program.programId
    );

    console.log("  ✓ Test accounts initialized");
  });

  it("Initializes config with admin and fee settings", async () => {
    const feeBasisPoints = 100; // 1%

    const tx = await program.methods
      .initializeConfig(feeBasisPoints)
      .accounts({
        admin: admin.publicKey,
        feeCollector: feeCollector.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("Initialize config transaction signature:", tx);

    // Fetch config account
    const config = await program.account.config.fetch(configPda);

    // Verify config data
    assert.ok(config.admin.equals(admin.publicKey));
    assert.ok(config.feeCollector.equals(feeCollector.publicKey));
    assert.equal(config.feeBasisPoints, feeBasisPoints);

    console.log(`  ✓ Config initialized`);
    console.log(`    Admin: ${config.admin.toString()}`);
    console.log(`    Fee: ${config.feeBasisPoints} basis points (${config.feeBasisPoints / 100}%)`);
    console.log(`    Fee Collector: ${config.feeCollector.toString()}`);
  });

  it("Fails to initialize config twice", async () => {
    try {
      await program.methods
        .initializeConfig(100)
        .accounts({
          admin: admin.publicKey,
          feeCollector: feeCollector.publicKey,
        })
        .signers([admin])
        .rpc();

      assert.fail("Expected error when initializing config twice");
    } catch (error) {
      expect(error.message).to.include("already in use");
      console.log("  ✓ Correctly prevented duplicate config initialization");
    }
  });

  it("Fails to initialize config with excessive fee", async () => {
    const newAdmin = anchor.web3.Keypair.generate();
    const airdrop = await provider.connection.requestAirdrop(
      newAdmin.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop);

    try {
      await program.methods
        .initializeConfig(1001) // 10.01% - too high
        .accounts({
          admin: newAdmin.publicKey,
          feeCollector: feeCollector.publicKey,
        })
        .signers([newAdmin])
        .rpc();

      assert.fail("Expected error when fee exceeds maximum");
    } catch (error) {
      expect(error.message).to.include("FeeTooHigh");
      console.log("  ✓ Correctly rejected excessive fee");
    }
  });

  it("Admin adds arbiter successfully", async () => {
    const tx = await program.methods
      .addArbiter()
      .accounts({
        config: configPda,
        arbiter: arbiter1.publicKey,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("Add arbiter transaction signature:", tx);

    // Fetch arbiter account
    const arbiterAccount = await program.account.arbiter.fetch(arbiter1Pda);

    // Verify arbiter data
    assert.ok(arbiterAccount.arbiter.equals(arbiter1.publicKey));
    assert.ok(arbiterAccount.addedBy.equals(admin.publicKey));
    assert.equal(arbiterAccount.isActive, true);
    assert.ok(arbiterAccount.addedAt.toNumber() > 0);

    console.log(`  ✓ Arbiter added: ${arbiterAccount.arbiter.toString()}`);
    console.log(`    Active: ${arbiterAccount.isActive}`);
    console.log(`    Added by: ${arbiterAccount.addedBy.toString()}`);
  });

  it("Admin adds second arbiter", async () => {
    await program.methods
      .addArbiter()
      .accounts({
        config: configPda,
        arbiter: arbiter2.publicKey,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const arbiterAccount = await program.account.arbiter.fetch(arbiter2Pda);
    assert.ok(arbiterAccount.arbiter.equals(arbiter2.publicKey));
    assert.equal(arbiterAccount.isActive, true);

    console.log(`  ✓ Second arbiter added: ${arbiter2.publicKey.toString()}`);
  });

  it("Non-admin cannot add arbiter", async () => {
    const unauthorized = anchor.web3.Keypair.generate();
    const airdrop = await provider.connection.requestAirdrop(
      unauthorized.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop);

    const newArbiter = anchor.web3.Keypair.generate();

    try {
      await program.methods
        .addArbiter()
        .accounts({
          config: configPda,
          arbiter: newArbiter.publicKey,
          admin: unauthorized.publicKey,
        })
        .signers([unauthorized])
        .rpc();

      assert.fail("Expected error when non-admin tries to add arbiter");
    } catch (error) {
      expect(error.message).to.include("Unauthorized");
      console.log("  ✓ Correctly prevented non-admin from adding arbiter");
    }
  });

  it("Admin removes arbiter", async () => {
    // Verify arbiter is active before removal
    let arbiterAccount = await program.account.arbiter.fetch(arbiter2Pda);
    assert.equal(arbiterAccount.isActive, true);

    const tx = await program.methods
      .removeArbiter()
      .accounts({
        config: configPda,
        arbiterAccount: arbiter2Pda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("Remove arbiter transaction signature:", tx);

    // Verify arbiter is now inactive
    arbiterAccount = await program.account.arbiter.fetch(arbiter2Pda);
    assert.equal(arbiterAccount.isActive, false);

    console.log(`  ✓ Arbiter removed (deactivated): ${arbiter2.publicKey.toString()}`);
  });

  it("Non-admin cannot remove arbiter", async () => {
    const unauthorized = anchor.web3.Keypair.generate();
    const airdrop = await provider.connection.requestAirdrop(
      unauthorized.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdrop);

    try {
      await program.methods
        .removeArbiter()
        .accounts({
          config: configPda,
          arbiterAccount: arbiter1Pda,
          admin: unauthorized.publicKey,
        })
        .signers([unauthorized])
        .rpc();

      assert.fail("Expected error when non-admin tries to remove arbiter");
    } catch (error) {
      expect(error.message).to.include("Unauthorized");
      console.log("  ✓ Correctly prevented non-admin from removing arbiter");
    }
  });

  it("Active arbiter can resolve disputes", async () => {
    // Create escrow and raise dispute
    const buyer = anchor.web3.Keypair.generate();
    const seller = anchor.web3.Keypair.generate();

    // Airdrop to buyer and seller
    const buyerAirdrop = await provider.connection.requestAirdrop(
      buyer.publicKey,
      3 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(buyerAirdrop);

    const sellerAirdrop = await provider.connection.requestAirdrop(
      seller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sellerAirdrop);

    // Airdrop to arbiter for signing
    const arbiterAirdrop = await provider.connection.requestAirdrop(
      arbiter1.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(arbiterAirdrop);

    // Create escrow
    const amount = 0.5 * LAMPORTS_PER_SOL;
    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([buyer])
      .rpc();

    // Raise dispute
    await program.methods
      .raiseDispute()
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([buyer])
      .rpc();

    console.log("  ✓ Test escrow created and disputed");

    // Resolve dispute as authorized arbiter
    const tx = await program.methods
      .resolveDispute({ favorSeller: {} })
      .accounts({
        arbiter: arbiter1.publicKey,
        arbiterAccount: arbiter1Pda,
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([arbiter1])
      .rpc();

    console.log("  ✓ Authorized arbiter resolved dispute successfully");
    console.log(`    Transaction: ${tx}`);
  });

  it("Inactive arbiter cannot resolve disputes", async () => {
    // Create another escrow and dispute
    const buyer = anchor.web3.Keypair.generate();
    const seller = anchor.web3.Keypair.generate();

    const buyerAirdrop = await provider.connection.requestAirdrop(
      buyer.publicKey,
      3 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(buyerAirdrop);

    const sellerAirdrop = await provider.connection.requestAirdrop(
      seller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sellerAirdrop);

    const arbiterAirdrop = await provider.connection.requestAirdrop(
      arbiter2.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(arbiterAirdrop);

    // Create escrow
    const amount = 0.5 * LAMPORTS_PER_SOL;
    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([buyer])
      .rpc();

    // Raise dispute
    await program.methods
      .raiseDispute()
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([buyer])
      .rpc();

    // Try to resolve as inactive arbiter
    try {
      await program.methods
        .resolveDispute({ favorBuyer: {} })
        .accounts({
          arbiter: arbiter2.publicKey,
          arbiterAccount: arbiter2Pda,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
        })
        .signers([arbiter2])
        .rpc();

      assert.fail("Expected error when inactive arbiter tries to resolve dispute");
    } catch (error) {
      expect(error.message).to.include("UnauthorizedArbiter");
      console.log("  ✓ Correctly prevented inactive arbiter from resolving dispute");
    }
  });

  it("Unauthorized user cannot resolve disputes", async () => {
    // Create another escrow and dispute
    const buyer = anchor.web3.Keypair.generate();
    const seller = anchor.web3.Keypair.generate();
    const fakeArbiter = anchor.web3.Keypair.generate();

    const buyerAirdrop = await provider.connection.requestAirdrop(
      buyer.publicKey,
      3 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(buyerAirdrop);

    const sellerAirdrop = await provider.connection.requestAirdrop(
      seller.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sellerAirdrop);

    const fakeAirdrop = await provider.connection.requestAirdrop(
      fakeArbiter.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(fakeAirdrop);

    // Create escrow
    const amount = 0.5 * LAMPORTS_PER_SOL;
    await program.methods
      .createEscrow(new anchor.BN(amount))
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([buyer])
      .rpc();

    // Raise dispute
    await program.methods
      .raiseDispute()
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
      })
      .signers([buyer])
      .rpc();

    // Derive non-existent arbiter PDA
    const [fakeArbiterPda] = PublicKey.findProgramAddressSync(
      [ARBITER_SEED, fakeArbiter.publicKey.toBuffer()],
      program.programId
    );

    // Try to resolve as unauthorized user
    try {
      await program.methods
        .resolveDispute({ split: {} })
        .accounts({
          arbiter: fakeArbiter.publicKey,
          arbiterAccount: fakeArbiterPda,
          buyer: buyer.publicKey,
          seller: seller.publicKey,
        })
        .signers([fakeArbiter])
        .rpc();

      assert.fail("Expected error when unauthorized user tries to resolve dispute");
    } catch (error) {
      expect(error.message).to.include("AccountNotInitialized");
      console.log("  ✓ Correctly prevented unauthorized user from resolving dispute");
    }
  });
});
