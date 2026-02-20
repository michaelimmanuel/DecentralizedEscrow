use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::EscrowError,
    events::{DisputeResolved, ReputationUpdated},
    state::{Arbiter, Escrow, EscrowStatus, Reputation},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum DisputeResolution {
    FavorBuyer,   // Refund the buyer
    FavorSeller,  // Pay the seller
    Split,        // Split funds 50/50
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow.bump,
        constraint = escrow.status == EscrowStatus::Disputed @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, Escrow>,

    /// The arbiter who resolves disputes
    pub arbiter: Signer<'info>,

    /// The arbiter's authorization account
    #[account(
        seeds = [ARBITER_SEED, arbiter.key().as_ref()],
        bump = arbiter_account.bump,
        constraint = arbiter_account.can_resolve_disputes() @ EscrowError::UnauthorizedArbiter,
    )]
    pub arbiter_account: Account<'info, Arbiter>,

    /// CHECK: Buyer account for refund
    #[account(mut)]
    pub buyer: AccountInfo<'info>,

    /// CHECK: Seller account for payment
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

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ResolveDispute>, resolution: DisputeResolution) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let buyer = &ctx.accounts.buyer;
    let seller = &ctx.accounts.seller;
    let clock = Clock::get()?;

    let amount = escrow.amount;

    match resolution {
        DisputeResolution::FavorBuyer => {
            // Refund full amount to buyer
            **escrow.to_account_info().try_borrow_mut_lamports()? = escrow
                .to_account_info()
                .lamports()
                .checked_sub(amount)
                .ok_or(EscrowError::InsufficientFunds)?;

            **buyer.to_account_info().try_borrow_mut_lamports()? = buyer
                .lamports()
                .checked_add(amount)
                .ok_or(EscrowError::Overflow)?;

            msg!("Dispute resolved in favor of buyer: {} lamports refunded", amount);
        }
        DisputeResolution::FavorSeller => {
            // Pay full amount to seller
            **escrow.to_account_info().try_borrow_mut_lamports()? = escrow
                .to_account_info()
                .lamports()
                .checked_sub(amount)
                .ok_or(EscrowError::InsufficientFunds)?;

            **seller.to_account_info().try_borrow_mut_lamports()? = seller
                .lamports()
                .checked_add(amount)
                .ok_or(EscrowError::Overflow)?;

            msg!("Dispute resolved in favor of seller: {} lamports paid", amount);
        }
        DisputeResolution::Split => {
            // Split funds 50/50
            let half_amount = amount
                .checked_div(2)
                .ok_or(EscrowError::Overflow)?;
            let remainder = amount
                .checked_sub(half_amount)
                .ok_or(EscrowError::Overflow)?;

            **escrow.to_account_info().try_borrow_mut_lamports()? = escrow
                .to_account_info()
                .lamports()
                .checked_sub(amount)
                .ok_or(EscrowError::InsufficientFunds)?;

            **buyer.to_account_info().try_borrow_mut_lamports()? = buyer
                .lamports()
                .checked_add(half_amount)
                .ok_or(EscrowError::Overflow)?;

            **seller.to_account_info().try_borrow_mut_lamports()? = seller
                .lamports()
                .checked_add(remainder)
                .ok_or(EscrowError::Overflow)?;

            msg!(
                "Dispute resolved with split: {} lamports to buyer, {} lamports to seller",
                half_amount,
                remainder
            );
        }
    }

    // Update escrow status to Completed
    escrow.status = EscrowStatus::Completed;

    // Update reputations based on resolution
    match resolution {
        DisputeResolution::FavorBuyer => {
            // Buyer wins: buyer successful, seller failed
            if let Some(buyer_reputation) = &mut ctx.accounts.buyer_reputation {
                buyer_reputation.increment_successful();
                emit!(ReputationUpdated {
                    user: buyer_reputation.user,
                    successful_trades: buyer_reputation.successful_trades,
                    failed_trades: buyer_reputation.failed_trades,
                });
                msg!("Buyer reputation updated: {} successful trades", buyer_reputation.successful_trades);
            }
            if let Some(seller_reputation) = &mut ctx.accounts.seller_reputation {
                seller_reputation.increment_failed();
                emit!(ReputationUpdated {
                    user: seller_reputation.user,
                    successful_trades: seller_reputation.successful_trades,
                    failed_trades: seller_reputation.failed_trades,
                });
                msg!("Seller reputation updated: {} failed trades", seller_reputation.failed_trades);
            }
        }
        DisputeResolution::FavorSeller => {
            // Seller wins: seller successful, buyer failed
            if let Some(seller_reputation) = &mut ctx.accounts.seller_reputation {
                seller_reputation.increment_successful();
                emit!(ReputationUpdated {
                    user: seller_reputation.user,
                    successful_trades: seller_reputation.successful_trades,
                    failed_trades: seller_reputation.failed_trades,
                });
                msg!("Seller reputation updated: {} successful trades", seller_reputation.successful_trades);
            }
            if let Some(buyer_reputation) = &mut ctx.accounts.buyer_reputation {
                buyer_reputation.increment_failed();
                emit!(ReputationUpdated {
                    user: buyer_reputation.user,
                    successful_trades: buyer_reputation.successful_trades,
                    failed_trades: buyer_reputation.failed_trades,
                });
                msg!("Buyer reputation updated: {} failed trades", buyer_reputation.failed_trades);
            }
        }
        DisputeResolution::Split => {
            // Split resolution: both parties share responsibility (both get failed trade)
            if let Some(buyer_reputation) = &mut ctx.accounts.buyer_reputation {
                buyer_reputation.increment_failed();
                emit!(ReputationUpdated {
                    user: buyer_reputation.user,
                    successful_trades: buyer_reputation.successful_trades,
                    failed_trades: buyer_reputation.failed_trades,
                });
                msg!("Buyer reputation updated: {} failed trades", buyer_reputation.failed_trades);
            }
            if let Some(seller_reputation) = &mut ctx.accounts.seller_reputation {
                seller_reputation.increment_failed();
                emit!(ReputationUpdated {
                    user: seller_reputation.user,
                    successful_trades: seller_reputation.successful_trades,
                    failed_trades: seller_reputation.failed_trades,
                });
                msg!("Seller reputation updated: {} failed trades", seller_reputation.failed_trades);
            }
        }
    }

    // Emit event
    emit!(DisputeResolved {
        escrow: escrow.key(),
        arbiter: ctx.accounts.arbiter.key(),
        resolution: match resolution {
            DisputeResolution::FavorBuyer => "FavorBuyer".to_string(),
            DisputeResolution::FavorSeller => "FavorSeller".to_string(),
            DisputeResolution::Split => "Split".to_string(),
        },
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
