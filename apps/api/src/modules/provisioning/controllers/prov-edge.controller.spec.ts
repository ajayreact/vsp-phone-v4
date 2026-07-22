import { Logger, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProvEdgeController } from './prov-edge.controller';

describe('ProvEdgeController — Grandstream compatibility', () => {
  const mac = 'ec74d751e3e7';
  const sampleXml = '<gs_provision version="1"><config version="1"/></gs_provision>';

  let orchestrator: { serveConfig: jest.Mock };
  let controller: ProvEdgeController;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    orchestrator = {
      serveConfig: jest.fn().mockResolvedValue(sampleXml),
    };
    controller = new ProvEdgeController(
      orchestrator as never,
      { firmwarePath: jest.fn() } as never,
      { findExact: jest.fn() } as never,
    );
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function mockReqRes(path: string, userAgent: string) {
    const req = {
      path,
      url: path,
      ip: '192.168.1.3',
      headers: { 'user-agent': userAgent },
      provMac: mac,
    } as Request & { provMac: string };
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;
    return { req, res };
  }

  async function expectSameConfig(path: string, userAgent: string): Promise<void> {
    const { req, res } = mockReqRes(path, userAgent);
    await controller.downloadGrandstreamConfig(req, res);

    expect(orchestrator.serveConfig).toHaveBeenCalledWith(mac, {
      srcIp: '192.168.1.3',
      userAgent,
      requestedUri: path.split('?')[0],
      normalizedUri: `/gs/${mac}/cfg.xml`,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(sampleXml);

    const requestLog = logSpy.mock.calls
      .map((call) => JSON.parse(String(call[0])))
      .find((entry) => entry.event === 'provisioning.request');
    expect(requestLog).toMatchObject({
      event: 'provisioning.request',
      requestedUri: path.split('?')[0],
      normalizedUri: `/gs/${mac}/cfg.xml`,
      mac,
      userAgent,
      httpStatus: 200,
    });
    expect(requestLog).toBeTruthy();
    orchestrator.serveConfig.mockClear();
    logSpy.mockClear();
  }

  it('serves identical cfg.xml for curl legacy path', async () => {
    await expectSameConfig(`/gs/${mac}/cfg.xml`, 'curl/8.18.0');
  });

  it('serves identical cfg.xml for Grandstream native MAC filename', async () => {
    await expectSameConfig(`/gs/cfg${mac}.xml`, 'Grandstream GRP2601 1.0.24.14');
  });

  it('serves identical cfg.xml for directory-style cfg.xml append paths', async () => {
    await expectSameConfig(
      `/gs/${mac}/cfg.xml/cfg${mac}.xml`,
      'Grandstream GRP2601 1.0.24.14',
    );
    await expectSameConfig(
      `/gs/${mac}/cfg.xml/cfggrp2601.xml`,
      'Grandstream GRP2601 1.0.24.14',
    );
    await expectSameConfig(
      `/gs/${mac}/cfg.xml/cfg.xml`,
      'Grandstream GRP2601 1.0.24.14',
    );
  });

  it('serves identical cfg.xml for native directory filenames using auth MAC', async () => {
    await expectSameConfig('/gs/cfggrp2601.xml', 'Grandstream GRP2601 1.0.24.14');
    await expectSameConfig('/gs/cfg.xml', 'Grandstream GRP2601 1.0.24.14');
  });

  it('rejects unknown Grandstream paths with 404', async () => {
    const { req, res } = mockReqRes('/gs/unknown-path', 'Grandstream GRP2601 1.0.24.14');
    await expect(controller.downloadGrandstreamConfig(req, res)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(orchestrator.serveConfig).not.toHaveBeenCalled();
  });

  it.each([
    '/gs/random.txt',
    '/gs/foo/bar',
    '/gs/cfginvalid.xml',
    '/gs/../../test',
  ])('rejects invalid path %s with 404', async (path) => {
    const { req, res } = mockReqRes(path, 'Grandstream GRP2601 1.0.24.14');
    await expect(controller.downloadGrandstreamConfig(req, res)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(orchestrator.serveConfig).not.toHaveBeenCalled();
  });
});
