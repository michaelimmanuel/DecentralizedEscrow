use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

use crate::{
    constants::*,
    errors::EscrowError,
    events::EscrowCreated,
    state::{Escrow, EscrowStatus},
};

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct CreateEscrow<'info> {
    #[account(
        init,
        payer = buyer,
        space = 8 + Escrow::LEN,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller doesn't need to sign, just be a valid account
    pub seller: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateEscrow>, amount: u64) -> Result<()> {
    let buyer = &ctx.accounts.buyer;
    let seller = &ctx.accounts.seller;
    let escrow = &mut ctx.accounts.escrow;
    let clock = Clock::get()?;

    // Validate amount is within bounds
    require!(
        amount >= MIN_ESCROW_AMOUNT,
        EscrowError::InsufficientFunds
    );
    require!(
        amount <= MAX_ESCROW_AMOUNT,
        EscrowError::InvalidAmount
    );

    // Validate buyer and seller are different
    require!(
        buyer.key() != seller.key(),
        EscrowError::InvalidParties
    );

    // Transfer funds from buyer to escrow PDA
    let transfer_accounts = Transfer {
        from: buyer.to_account_info(),
        to: escrow.to_account_info(),
    };
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_accounts,
    );
    transfer(cpi_context, amount)?;

    // Initialize escrow account
    escrow.buyer = buyer.key();
    escrow.seller = seller.key();
    escrow.amount = amount;
    escrow.status = EscrowStatus::Active;
    escrow.created_at = clock.unix_timestamp;
    escrow.bump = ctx.bumps.escrow;

    // Emit event
    emit!(EscrowCreated {
        escrow: escrow.key(),
        buyer: buyer.key(),
        seller: seller.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Escrow created: {} lamports from {} to {}", amount, buyer.key(), seller.key());

    Ok(())
}