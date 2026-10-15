ALTER TABLE email_alert_delivery DROP CONSTRAINT email_alert_delivery_kind_check;
ALTER TABLE email_alert_delivery ADD CONSTRAINT email_alert_delivery_kind_check
  CHECK (kind IN ('unavailable','recovery','test','manual'));
