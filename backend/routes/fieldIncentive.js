'use strict';

const express = require('express');
const router = express.Router();
const { authorize } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLogger');
const FieldIncentiveController = require('../controllers/FieldIncentiveController');

const admin = authorize('superadmin', 'admin', 'finance');

router.get('/summary', admin, (r, s) => FieldIncentiveController.summary(r, s));
router.get('/settings', admin, (r, s) => FieldIncentiveController.settings(r, s));
router.put('/settings', admin, logActivity('update', 'field_incentive_rules'), (r, s) => FieldIncentiveController.saveSettings(r, s));
router.get('/staff', admin, (r, s) => FieldIncentiveController.staff(r, s));
router.get('/detail/:userId', admin, (r, s) => FieldIncentiveController.detail(r, s));
router.post('/pay-money', admin, logActivity('update', 'field_incentive'), (r, s) => FieldIncentiveController.payMoney(r, s));
router.post('/pay-oil', admin, logActivity('update', 'field_incentive'), (r, s) => FieldIncentiveController.payOil(r, s));
router.post('/router', admin, logActivity('create', 'field_incentive'), (r, s) => FieldIncentiveController.addRouter(r, s));
router.post('/sisa', admin, logActivity('create', 'field_incentive'), (r, s) => FieldIncentiveController.addSisa(r, s));
router.post('/backfill', admin, logActivity('create', 'field_incentive'), (r, s) => FieldIncentiveController.backfill(r, s));
router.post('/:id/void', admin, logActivity('delete', 'field_incentive'), (r, s) => FieldIncentiveController.voidRow(r, s));

module.exports = router;
