'use strict';

/**
 * Hapus data core yang menempel di infrastructure_links sebelum link dihapus.
 * Tabel core hanya ada di instalasi Fiberix yang sudah pakai manajemen core;
 * kalau tabel belum ada, fungsi ini no-op.
 */
function missingTable(err) {
  const msg = String((err && err.message) || err || '');
  return /doesn'?t exist|unknown table|er_no_such_table|no such table/i.test(msg);
}

async function deleteLinkDependents(sequelize, linkId, transaction) {
  if (!sequelize || linkId == null) return 0;
  const opts = { replacements: { id: Number(linkId) }, transaction };
  try {
    await sequelize.query(
      `DELETE FROM infrastructure_core_connections
        WHERE source_core_id IN (SELECT id FROM infrastructure_cable_cores WHERE cable_id = :id)
           OR target_core_id IN (SELECT id FROM infrastructure_cable_cores WHERE cable_id = :id)`,
      opts
    );
  } catch (e) {
    if (missingTable(e)) return 0;
    throw e;
  }
  try {
    await sequelize.query(
      `DELETE FROM infrastructure_subscriber_cores
        WHERE core_id IN (SELECT id FROM infrastructure_cable_cores WHERE cable_id = :id)`,
      opts
    );
  } catch (e) {
    if (!missingTable(e)) throw e;
  }
  const [result] = await sequelize.query(
    `DELETE FROM infrastructure_cable_cores WHERE cable_id = :id`,
    opts
  );
  return (result && result.affectedRows) || 0;
}

async function deleteLinksForPoint(sequelize, InfrastructureLink, Op, pointId, transaction) {
  const links = await InfrastructureLink.findAll({
    where: {
      [Op.or]: [
        { from_point_id: pointId },
        { to_point_id: pointId }
      ]
    },
    attributes: ['id'],
    transaction
  });
  for (const link of links) {
    await deleteLinkDependents(sequelize, link.id, transaction);
    await link.destroy({ transaction });
  }
  return links.length;
}

module.exports = { deleteLinkDependents, deleteLinksForPoint };
