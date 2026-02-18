use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::EscrowError,
    events::DisputeResolved,
    state::{Escrow, EscrowStatus},
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
    /// TODO: Add proper arbiter authority validation (e.g., from config account)
    pub arbiter: Signer<'info>,

    /// CHECK: Buyer account for refund
    #[account(mut)]
    pub buyer: AccountInfo<'info>,

    /// CHECK: Seller account for payment
    #[account(mut)]
    pub seller: AccountInfo<'info>,

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
