'use strict';

const logger = require('../utils/logger');
const { collectServerResources } = require('../utils/cpuMem');
const { getMikrotikInstanceByDevice } = require('../services/MikrotikService');

function resolveDeviceId(req) {
  const q = req.query?.device_id;
  const h = req.headers?.['x-device-id'];
  const v = q || h;
  return v ? parseInt(v) : null;
}

async function getMt(req) {
  return getMikrotikInstanceByDevice(resolveDeviceId(req));
}

class ResourceController {

  async getRouterResources(req, res) {
    try {
      const mikrotik = await getMt(req);
      const resource = await mikrotik.getSystemResource();
      const identity = await mikrotik.getSystemIdentity();

      const memoryUsed = resource.totalMemory - resource.freeMemory;
      const memoryUsagePercent = resource.totalMemory > 0
        ? Math.round((memoryUsed / resource.totalMemory) * 100)
        : 0;

      res.json({
        success: true,
        data: {
          identity: identity.name || 'MikroTik',
          version: resource.version,
          boardName: resource.boardName,
          platform: resource.platform,
          uptime: resource.uptime,
          cpuLoad: resource.cpuLoad,
          totalMemory: resource.totalMemory,
          freeMemory: resource.freeMemory,
          usedMemory: memoryUsed,
          memoryUsagePercent
        }
      });
    } catch (e) {
      logger.error('[ResourceController.getRouterResources]', e.message);
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data router: ' + e.message
      });
    }
  }

  async getServerResources(req, res) {
    try {
      res.json({ success: true, data: collectServerResources() });
    } catch (e) {
      logger.error('[ResourceController.getServerResources]', e.message);
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data server: ' + e.message
      });
    }
  }

  async getAllResources(req, res) {
    try {
      let routerData = null;
      try {
        const mikrotik = await getMt(req);
        const resource = await mikrotik.getSystemResource();
        const identity = await mikrotik.getSystemIdentity();

        const memoryUsed = resource.totalMemory - resource.freeMemory;
        const memoryUsagePercent = resource.totalMemory > 0
          ? Math.round((memoryUsed / resource.totalMemory) * 100)
          : 0;

        routerData = {
          identity: identity.name || 'MikroTik',
          version: resource.version,
          boardName: resource.boardName,
          platform: resource.platform,
          uptime: resource.uptime,
          cpuLoad: resource.cpuLoad,
          totalMemory: resource.totalMemory,
          freeMemory: resource.freeMemory,
          usedMemory: memoryUsed,
          memoryUsagePercent
        };
      } catch (routerErr) {
        logger.warn('[ResourceController] Router unavailable:', routerErr.message);
        routerData = { error: routerErr.message };
      }

      res.json({
        success: true,
        data: {
          router: routerData,
          server: collectServerResources()
        }
      });
    } catch (e) {
      logger.error('[ResourceController.getAllResources]', e.message);
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil data resources: ' + e.message
      });
    }
  }
}

module.exports = new ResourceController();
