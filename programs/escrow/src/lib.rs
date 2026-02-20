use anchor_lang::prelude::*;

mod constants;
mod errors;
mod events;
mod instructions;
mod state;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("9X6QbCnVwTg1EjQDNt9KrT7rvJqPRVAUWfYCkNRZW9VY");

#[program]
pub mod escrow {
    use super::*;

    pub fn initialize_reputation(ctx: Context<InitializeReputation>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn create_escrow(ctx: Context<CreateEscrow>, amount: u64) -> Result<()> {
        instructions::create_escrow::handler(ctx, amount)
    }

    pub fn release_funds(ctx: Context<ReleaseFunds>) -> Result<()> {
        instructions::release_funds::handler(ctx)
    }

    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        instructions::cancel_escrow::handler(ctx)
    }

    pub fn refund_buyer(ctx: Context<RefundBuyer>) -> Result<()> {
        instructions::refund_buyer::handler(ctx)
    }

    pub fn raise_dispute(ctx: Context<RaiseDispute>) -> Result<()> {
        instructions::raise_dispute::handler(ctx)
    }

    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        resolution: instructions::resolve_dispute::DisputeResolution,
    ) -> Result<()> {
        instructions::resolve_dispute::handler(ctx, resolution)
    }

    pub fn update_reputation(
        ctx: Context<UpdateReputation>,
        update: instructions::update_reputation::ReputationUpdate,
    ) -> Result<()> {
        instructions::update_reputation::handler(ctx, update)
    }

    pub fn initialize_config(ctx: Context<InitializeConfig>, fee_basis_points: u16) -> Result<()> {
        instructions::initialize_config::handler(ctx, fee_basis_points)
    }

    pub fn add_arbiter(ctx: Context<AddArbiter>) -> Result<()> {
        instructions::add_arbiter::handler(ctx)
    }

    pub fn remove_arbiter(ctx: Context<RemoveArbiter>) -> Result<()> {
        instructions::remove_arbiter::handler(ctx)
    }
}
