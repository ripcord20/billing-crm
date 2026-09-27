const express = require('express');
const router  = express.Router();
const { authenticate, hasPermission } = require('../middleware/auth');
const ctrl = require('../controllers/TicketController');

router.get ('/stats',              authenticate, ctrl.stats);
router.get ('/customers/search',   authenticate, ctrl.searchCustomers);
router.get ('/infra/points',       authenticate, ctrl.infraPoints);
router.get ('/',                   authenticate, ctrl.index);
router.post('/',                   authenticate, hasPermission('ticket_create'), ctrl.create);
router.get ('/:id',                authenticate, ctrl.show);
router.put ('/:id',                authenticate, hasPermission('ticket_update'), ctrl.update);
router.delete('/:id',              authenticate, hasPermission('ticket_delete'), ctrl.destroy);
router.post('/:id/timeline',       authenticate, hasPermission('ticket_update'), ctrl.uploadMiddleware, ctrl.addTimeline);

module.exports = router;