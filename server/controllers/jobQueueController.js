const { allQueues } = require('../services/jobQueueService');
const { logger } = require('../utils/logger');
const AuditLog = require('../models/AuditLog');
const { Job } = require('bullmq');

const getQueue = (name) => {
    const queue = allQueues[name];
    if (!queue) {
        const error = new Error(`Queue not found: ${name}`);
        error.statusCode = 404;
        throw error;
    }
    return queue;
};

exports.getQueues = async (req, res) => {
    try {
        const queueData = await Promise.all(
            Object.entries(allQueues).map(async ([name, queue]) => {
                const counts = await queue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed');
                const isPaused = await queue.isPaused();
                return { name, isPaused, ...counts };
            })
        );
        res.json(queueData);
    } catch (error) {
        logger.error('Error fetching queue data:', error);
        res.status(500).json({ message: 'Failed to fetch queue data.' });
    }
};

exports.getJobs = async (req, res) => {
    try {
        const { queueName } = req.params;
        const { page = 1, limit = 15, status = 'failed' } = req.query;
        const queue = getQueue(queueName);

        const start = (parseInt(page) - 1) * parseInt(limit);
        const end = start + parseInt(limit) - 1;

        const jobs = await queue.getJobs([status], start, end, true);
        const total = await queue.getJobCountByTypes(status);

        res.json({
            jobs,
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / limit),
            totalJobs: total,
        });
    } catch (error) {
        logger.error(`Error fetching jobs for queue ${req.params.queueName}:`, error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
    }
};

exports.getJobDetails = async (req, res) => {
    try {
        const { queueName, jobId } = req.params;
        const queue = getQueue(queueName);
        const job = await Job.fromId(queue, jobId);
        if (!job) {
            return res.status(404).json({ message: 'Job not found.' });
        }
        res.json(job);
    } catch (error) {
        logger.error(`Error fetching job details for job ${req.params.jobId}:`, error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
    }
};

exports.performJobAction = async (req, res) => {
    const { queueName } = req.params;
    const { jobIds, action, reason, jobStatus } = req.body;
    const adminUserId = req.user._id;

    try {
        const queue = getQueue(queueName);
        const jobs = await Promise.all(jobIds.map(id => Job.fromId(queue, id)));

        for (const job of jobs) {
            if (job) {
                switch (action) {
                    case 'retry': await job.retry(); break;
                    case 'delete': await job.remove(); break;
                    case 'promote': await job.promote(); break;
                    default: break;
                }
            }
        }

        await AuditLog.create({
            adminUserId,
            action: `job_action_${action}`,
            reason,
            metadata: {
                queueName,
                action,
                jobCount: jobIds.length,
                jobIds,
                jobStatus,
            }
        });

        res.json({ success: true, message: `Action '${action}' performed on ${jobIds.length} jobs.` });
    } catch (error) {
        logger.error(`Error performing job action '${action}' on queue ${queueName}:`, error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
    }
};

exports.performQueueAction = async (req, res) => {
    const { queueName } = req.params;
    const { action, reason } = req.body;
    const adminUserId = req.user._id;

    try {
        const queue = getQueue(queueName);
        if (action === 'pause') {
            await queue.pause();
        } else if (action === 'resume') {
            await queue.resume();
        }

        await AuditLog.create({
            adminUserId,
            action: `queue_action_${action}`,
            reason,
            metadata: { queueName, action }
        });

        res.json({ success: true, message: `Queue '${queueName}' has been ${action}d.` });
    } catch (error) {
        logger.error(`Error performing queue action '${action}' on queue ${queueName}:`, error);
        res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
    }
};