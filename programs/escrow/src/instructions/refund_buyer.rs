use anchor_lang::prelude::*;
use crate::{
    constants::{ESCROW_SEED, REPUTATION_SEED},
    errors::EscrowError,
    events::{RefundIssued, ReputationUpdated},
    state::{Escrow, EscrowStatus, Reputation},
};

#[derive(Accounts)]
pub struct RefundBuyer<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow.bump,
        has_one = buyer,
        has_one = seller,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: This is the seller account
    #[account(mut)]
    pub seller: SystemAccount<'info>,

    /// Buyer's reputation account (optional)
    #[account(
        mut,
        seeds = [REPUTATION_SEED, buyer.key().as_ref()],
        bump,
    )]
    pub buyer_reputation: Option<Account<'info, Reputation>>,

    /// Seller's reputation account (optional)
    #[account(
        mut,
        seeds = [REPUTATION_SEED, seller.key().as_ref()],
        bump,
    )]
    pub seller_reputation: Option<Account<'info, Reputation>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RefundBuyer>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    
    // Check that escrow is in Disputed state
    require!(
        matches!(escrow.status, EscrowStatus::Disputed),
        EscrowError::InvalidState
    );

    // Get the amount to refund
    let refund_amount = escrow.amount;

    // Transfer funds from escrow PDA back to buyer using direct lamport manipulation
    let escrow_account_info = escrow.to_account_info();
    let buyer_account_info = ctx.accounts.buyer.to_account_info();

    // Get the rent-exempt reserve for the escrow account
    let rent = Rent::get()?;
    let escrow_rent_reserve = rent.minimum_balance(escrow_account_info.data_len());

    // Calculate available lamports (total - rent reserve)
    let escrow_lamports = escrow_account_info.lamports();
    require!(
        escrow_lamports > escrow_rent_reserve,
        EscrowError::InsufficientFunds
    );

    // Transfer lamports back to buyer
    **escrow_account_info.try_borrow_mut_lamports()? = escrow_rent_reserve;
    **buyer_account_info.try_borrow_mut_lamports()? = buyer_account_info
        .lamports()
        .checked_add(escrow_lamports - escrow_rent_reserve)
        .ok_or(EscrowError::Overflow)?;

    // Update escrow status to Cancelled
    escrow.status = EscrowStatus::Cancelled;

    // Update reputation for buyer if account exists (failed trade)
    if let Some(buyer_reputation) = &mut ctx.accounts.buyer_reputation {
        buyer_reputation.increment_failed();
        emit!(ReputationUpdated {
            user: buyer_reputation.user,
            successful_trades: buyer_reputation.successful_trades,
            failed_trades: buyer_reputation.failed_trades,
        });
        msg!("Buyer reputation updated: {} failed trades", buyer_reputation.failed_trades);
    }

    // Update reputation for seller if account exists (failed trade)
    if let Some(seller_reputation) = &mut ctx.accounts.seller_reputation {
        seller_reputation.increment_failed();
        emit!(ReputationUpdated {
            user: seller_reputation.user,
            successful_trades: seller_reputation.successful_trades,
            failed_trades: seller_reputation.failed_trades,
        });
        msg!("Seller reputation updated: {} failed trades", seller_reputation.failed_trades);
    }

    // Emit RefundIssued event
    emit!(RefundIssued {
        escrow: escrow.key(),
        buyer: ctx.accounts.buyer.key(),
        amount: refund_amount,
        reason: "Disputed escrow refund".to_string(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!("Buyer refunded {} lamports from disputed escrow", refund_amount);

    Ok(())
}
