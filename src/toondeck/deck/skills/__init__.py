"""deck.skills — cross-platform skills sync engine (M2).

Contract (frozen M0; implementation lands in M2):
- sync_all()     → derive the source-of-truth skills to every agent view
- remove_skill() → the ONLY deletion entry (tombstone + graveyard)
- doctor()       → five-view consistency report
"""

def _not_impl(name: str):
    def _f(*args, **kwargs):
        raise NotImplementedError(f"deck.skills.{name} lands in M2")
    return _f


sync_all = _not_impl("sync_all")
remove_skill = _not_impl("remove_skill")
doctor = _not_impl("doctor")
