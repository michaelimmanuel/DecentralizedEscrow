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

  describe("release_funds", () => {
    let releaseEscrowPda: PublicKey;
    let releaseSeller: anchor.web3.Keypair;
    const releaseAmount = 0.5 * LAMPORTS_PER_SOL;

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

  describe("cancel_escrow", () => {
    let cancelEscrowPda: PublicKey;
    let cancelSeller: anchor.web3.Keypair;
    const cancelAmount = 0.3 * LAMPORTS_PER_SOL;

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
          buyer: buyer.publicKey,
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
            buyer: unauthorizedUser.publicKey,
            seller: tempSeller.publicKey,
          })
          .signers([unauthorizedUser])
          .rpc();

        assert.fail("Should have failed");
      } catch (error) {
        assert.ok(
          error.message.includes("constraint") || 
          error.message.includes("escrow") ||
          error.message.includes("ConstraintHasOne"),
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
            buyer: buyer.publicKey,
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
          buyer: buyer.publicKey,
          seller: tempSeller.publicKey,
        })
        .rpc();

      try {
        // Try to cancel again
        await program.methods
          .cancelEscrow()
          .accounts({
            buyer: buyer.publicKey,
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
          buyer: buyer.publicKey,
          seller: seller1.publicKey,
        })
        .rpc();

      await program.methods
        .cancelEscrow()
        .accounts({
          buyer: buyer.publicKey,
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
});


