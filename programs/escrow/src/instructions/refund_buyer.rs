use anchor_lang::prelude::*;
use crate::{
    constants::ESCROW_SEED,
    errors::EscrowError,
    events::RefundIssued,
    state::{Escrow, EscrowStatus},
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

    // TODO: Update reputations - this will be handled by a separate instruction
    // or when the initialize_reputation instruction is implemented

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
