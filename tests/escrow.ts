import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Escrow } from "../target/types/escrow";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("escrow", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.escrow as Program<Escrow>;

  // Test accounts
  const buyer = provider.wallet;
  let seller: anchor.web3.Keypair;
  let escrowPda: PublicKey;
  let escrowBump: number;

  const ESCROW_SEED = Buffer.from("escrow");
  const MIN_ESCROW_AMOUNT = 10_000_000; // 0.01 SOL
  const MAX_ESCROW_AMOUNT = 1_000_000_000_000; // 1000 SOL

  before(async () => {
    // Create seller keypair
    seller = anchor.web3.Keypair.generate();

    // Airdrop SOL to seller for account rent
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
  });

  describe("create_escrow", () => {
    it("Creates an escrow successfully", async () => {
      const amount = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL

      const tx = await program.methods
        .createEscrow(new anchor.BN(amount))
        .accounts({
          buyer: buyer.publicKey,
          seller: seller.publicKey,
        })
        .rpc();

      console.log("Create escrow transaction signature:", tx);

      // Fetch the escrow account
      const escrowAccount = await program.account.escrow.fetch(escrowPda);

      // Verify escrow account data
      assert.ok(escrowAccount.buyer.equals(buyer.publicKey));
      assert.ok(escrowAccount.seller.equals(seller.publicKey));
      assert.equal(escrowAccount.amount.toNumber(), amount);
      assert.equal(escrowAccount.bump, escrowBump);
      assert.deepEqual(escrowAccount.status, { active: {} });
      assert.ok(escrowAccount.createdAt.toNumber() > 0);

      // Verify escrow PDA has the funds
      const escrowBalance = await provider.connection.getBalance(escrowPda);
      assert.ok(escrowBalance >= amount);

      console.log("  Escrow created successfully");
      console.log(`  Buyer: ${escrowAccount.buyer.toString()}`);
      console.log(`  Seller: ${escrowAccount.seller.toString()}`);
      console.log(`  Amount: ${escrowAccount.amount.toNumber() / LAMPORTS_PER_SOL} SOL`);
      console.log(`  Status: Active`);
    });

    it("Creates escrow with minimum amount", async () => {
      const tempSeller = anchor.web3.Keypair.generate();
      const [tempEscrowPda] = PublicKey.findProgramAddressSync(
        [ESCROW_SEED, buyer.publicKey.toBuffer(), tempSeller.publicKey.toBuffer()],
        program.programId
      );

      const tx = await program.methods
        .createEscrow(new anchor.BN(MIN_ESCROW_AMOUNT))
        .accounts({
          buyer: buyer.publicKey,
          seller: tempSeller.publicKey,
        })
        .rpc();

      const escrowAccount = await program.account.escrow.fetch(tempEscrowPda);
      assert.equal(escrowAccount.amount.toNumber(), MIN_ESCROW_AMOUNT);

      console.log("  Escrow created with minimum amount (0.01 SOL)");
    });

    it("Fails to create escrow with amount below minimum", async () => {
      const tempSeller = anchor.web3.Keypair.generate();
      const [tempEscrowPda] = PublicKey.findProgramAddressSync(
        [ESCROW_SEED, buyer.publicKey.toBuffer(), tempSeller.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createEscrow(new anchor.BN(MIN_ESCROW_AMOUNT - 1))
          .accounts({
            buyer: buyer.publicKey,
            seller: tempSeller.publicKey,
          })
          .rpc();

        assert.fail("Should have failed with InsufficientFunds error");
      } catch (error) {
        assert.include(error.message, "InsufficientFunds");
        console.log("  Correctly rejected amount below minimum");
      }
    });

    it("Fails to create escrow with amount above maximum", async () => {
      const tempSeller = anchor.web3.Keypair.generate();
      const [tempEscrowPda] = PublicKey.findProgramAddressSync(
        [ESCROW_SEED, buyer.publicKey.toBuffer(), tempSeller.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createEscrow(new anchor.BN(MAX_ESCROW_AMOUNT + 1))
          .accounts({
            buyer: buyer.publicKey,
            seller: tempSeller.publicKey,
          })
          .rpc();

        assert.fail("Should have failed with InvalidAmount error");
      } catch (error) {
        assert.include(error.message, "InvalidAmount");
        console.log("  Correctly rejected amount above maximum");
      }
    });

    it("Fails when buyer and seller are the same", async () => {
      const [tempEscrowPda] = PublicKey.findProgramAddressSync(
        [ESCROW_SEED, buyer.publicKey.toBuffer(), buyer.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createEscrow(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
          .accounts({
            buyer: buyer.publicKey,
            seller: buyer.publicKey,
          })
          .rpc();

        assert.fail("Should have failed with InvalidParties error");
      } catch (error) {
        assert.include(error.message, "InvalidParties");
        console.log("  Correctly rejected same buyer and seller");
      }
    });

    it("Creates multiple escrows between different parties", async () => {
      const seller2 = anchor.web3.Keypair.generate();
      const seller3 = anchor.web3.Keypair.generate();

      const [escrowPda2] = PublicKey.findProgramAddressSync(
        [ESCROW_SEED, buyer.publicKey.toBuffer(), seller2.publicKey.toBuffer()],
        program.programId
      );

      const [escrowPda3] = PublicKey.findProgramAddressSync(
        [ESCROW_SEED, buyer.publicKey.toBuffer(), seller3.publicKey.toBuffer()],
        program.programId
      );

      // Create first escrow
      await program.methods
        .createEscrow(new anchor.BN(0.2 * LAMPORTS_PER_SOL))
        .accounts({
          buyer: buyer.publicKey,
          seller: seller2.publicKey,
        })
        .rpc();

      // Create second escrow
      await program.methods
        .createEscrow(new anchor.BN(0.3 * LAMPORTS_PER_SOL))
        .accounts({
          buyer: buyer.publicKey,
          seller: seller3.publicKey,
        })
        .rpc();

      const escrow2 = await program.account.escrow.fetch(escrowPda2);
      const escrow3 = await program.account.escrow.fetch(escrowPda3);

      assert.equal(escrow2.amount.toNumber(), 0.2 * LAMPORTS_PER_SOL);
      assert.equal(escrow3.amount.toNumber(), 0.3 * LAMPORTS_PER_SOL);

      console.log("Multiple escrows created successfully");
    });
  });
});
