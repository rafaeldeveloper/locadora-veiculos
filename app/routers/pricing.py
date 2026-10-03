from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin
from app.models import PricingRule
from app.schemas import PricingRuleIn, PricingRuleOut

router = APIRouter(prefix="/api/pricing-rules", tags=["pricing"])


@router.get("", response_model=list[PricingRuleOut])
def list_rules(db: Session = Depends(get_db)):
    return list(db.scalars(select(PricingRule).order_by(PricingRule.min_days)))


@router.put("", response_model=PricingRuleOut, dependencies=[Depends(require_admin)])
def upsert_rule(data: PricingRuleIn, db: Session = Depends(get_db)):
    rule = db.scalar(select(PricingRule).where(PricingRule.min_days == data.min_days))
    if rule is None:
        rule = PricingRule(min_days=data.min_days)
        db.add(rule)
    rule.discount_percent = data.discount_percent
    db.commit()
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(PricingRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regra não encontrada")
    db.delete(rule)
    db.commit()
