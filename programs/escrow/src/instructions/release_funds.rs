use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::EscrowError,
    events::{FundsReleased, ReputationUpdated},
    state::{Config, Escrow, EscrowStatus, Reputation},
};

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow.bump,
        has_one = buyer,
        has_one = seller,
        constraint = escrow.can_release() @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller receives the funds
    #[account(mut)]
    pub seller: AccountInfo<'info>,

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

    /// Config account for fee settings (optional - no constraints to allow truly optional)
    #[account(mut)]
    pub config: Option<Account<'info, Config>>,

    /// Fee collector account (optional, receives platform fees)
    /// CHECK: Fee collector receives platform fees, validated manually in handler
    #[account(mut)]
    pub fee_collector: Option<AccountInfo<'info>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ReleaseFunds>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let seller = &ctx.accounts.seller;
    let clock = Clock::get()?;

    let amount = escrow.amount;
    let mut fee_amount = 0u64;
    let mut seller_amount = amount;

    // Calculate and deduct platform fee if config is provided
    if let Some(config) = &ctx.accounts.config {
        if let Some(fee_collector) = &ctx.accounts.fee_collector {
            // Validate config PDA
            let (expected_config_key, _) = Pubkey::find_program_address(
                &[CONFIG_SEED],
                &crate::ID,
            );
            require!(
                config.key() == expected_config_key,
                EscrowError::InvalidState
            );

            // Validate fee_collector PDA
            let (expected_fee_collector, _) = Pubkey::find_program_address(
                &[FEE_COLLECTOR_SEED],
                &crate::ID,
            );
            require!(
                fee_collector.key() == expected_fee_collector,
                EscrowError::InvalidFeeCollector
            );

            // Calculate fee (basis points: 100 = 1%)
            fee_amount = amount
                .checked_mul(config.fee_basis_points as u64)
                .ok_or(EscrowError::InsufficientFunds)?
                .checked_div(10_000)
                .ok_or(EscrowError::InsufficientFunds)?;
            
            seller_amount = amount
                .checked_sub(fee_amount)
                .ok_or(EscrowError::InsufficientFunds)?;

            // Transfer fee to fee collector
            **escrow.to_account_info().try_borrow_mut_lamports()? -= fee_amount;
            **fee_collector.try_borrow_mut_lamports()? += fee_amount;

            msg!("Platform fee deducted: {} lamports ({}%)", 
                fee_amount, 
                config.fee_basis_points as f64 / 100.0
            );
        }
    }

    // Transfer remaining funds from escrow PDA to seller
    **escrow.to_account_info().try_borrow_mut_lamports()? = escrow
        .to_account_info()
        .lamports()
        .checked_sub(seller_amount)
        .ok_or(EscrowError::InsufficientFunds)?;
    
    **seller.to_account_info().try_borrow_mut_lamports()? = seller
        .lamports()
        .checked_add(seller_amount)
        .ok_or(EscrowError::InsufficientFunds)?;

    // Update escrow status
    escrow.status = EscrowStatus::Completed;

    // Update reputation for buyer if account exists
    if let Some(buyer_reputation) = &mut ctx.accounts.buyer_reputation {
        buyer_reputation.increment_successful();
        emit!(ReputationUpdated {
            user: buyer_reputation.user,
            successful_trades: buyer_reputation.successful_trades,
            failed_trades: buyer_reputation.failed_trades,
        });
        msg!("Buyer reputation updated: {} successful trades", buyer_reputation.successful_trades);
    }

    // Update reputation for seller if account exists
    if let Some(seller_reputation) = &mut ctx.accounts.seller_reputation {
        seller_reputation.increment_successful();
        emit!(ReputationUpdated {
            user: seller_reputation.user,
            successful_trades: seller_reputation.successful_trades,
            failed_trades: seller_reputation.failed_trades,
        });
        msg!("Seller reputation updated: {} successful trades", seller_reputation.successful_trades);
    }

    // Emit event
    emit!(FundsReleased {
        escrow: escrow.key(),
        seller: seller.key(),
        amount: seller_amount,
        fee_amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Funds released: {} lamports to seller, {} lamports platform fee", seller_amount, fee_amount);

    Ok(())
}
