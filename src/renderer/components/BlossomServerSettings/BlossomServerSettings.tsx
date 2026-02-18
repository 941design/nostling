/**
 * Blossom Server Settings Component
 *
 * Settings panel for configuring Blossom servers for an identity.
 * Displays server list with health indicators, add/remove controls.
 *
 * Features:
 * - List servers with health status (green/yellow/red dots)
 * - Add server with URL and optional label input
 * - HTTPS validation on add
 * - Remove server with confirmation dialog
 * - Empty state with clear prompt
 * - Health checks on component mount only
 * - Optimistic UI with rollback on failure
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Text,
  Input,
  HStack,
  VStack,
  IconButton,
  Table,
  Button,
} from '@chakra-ui/react';
import { blossomApi } from '../../api/blossom-api';
import { BlossomServer, HealthCheckResult } from '../../../main/blossom/BlossomServerService';
import { useThemeColors } from '../../themes/ThemeContext';
import { toaster } from '../ui/toaster';

interface BlossomServerSettingsProps {
  identityPubkey: string;
}

type HealthStatus = 'checking' | 'healthy' | 'unhealthy';

interface ServerWithHealth extends BlossomServer {
  healthStatus: HealthStatus;
}

function HealthDot({ status }: { status: HealthStatus }) {
  const colors = useThemeColors();

  const getColor = (): string => {
    switch (status) {
      case 'healthy':
        return colors.statusSuccess;
      case 'checking':
        return colors.statusWarning;
      case 'unhealthy':
        return colors.statusError;
      default:
        return colors.textSubtle;
    }
  };

  return (
    <Box
      width="8px"
      height="8px"
      borderRadius="full"
      bg={getColor()}
      display="inline-block"
      data-testid="blossom-health-dot"
      data-status={status}
    />
  );
}

export function BlossomServerSettings({ identityPubkey }: BlossomServerSettingsProps): React.ReactElement {
  const colors = useThemeColors();
  const [servers, setServers] = useState<ServerWithHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [confirmRemoveUrl, setConfirmRemoveUrl] = useState<string | null>(null);

  // Fetch servers and run health checks on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchServers() {
      try {
        const fetched = await blossomApi.listServers(identityPubkey);
        if (cancelled) return;

        const withHealth: ServerWithHealth[] = fetched.map(s => ({
          ...s,
          healthStatus: 'checking' as HealthStatus,
        }));
        setServers(withHealth);
        setLoading(false);

        // Run health checks in parallel
        for (const server of fetched) {
          blossomApi.checkHealth(server.url).then((result: HealthCheckResult) => {
            if (cancelled) return;
            setServers(prev =>
              prev.map(s =>
                s.url === result.url
                  ? { ...s, healthStatus: result.healthy ? 'healthy' : 'unhealthy' }
                  : s
              )
            );
          });
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchServers();
    return () => { cancelled = true; };
  }, [identityPubkey]);

  const handleAdd = useCallback(async () => {
    const trimmedUrl = newUrl.trim();
    if (!trimmedUrl) return;

    if (!trimmedUrl.startsWith('https://')) {
      toaster.create({
        title: 'Invalid URL',
        description: 'Blossom server URL must use HTTPS',
        type: 'error',
      });
      return;
    }

    // Check for duplicates
    if (servers.some(s => s.url === trimmedUrl)) {
      toaster.create({
        title: 'Duplicate server',
        description: 'This server is already configured',
        type: 'error',
      });
      return;
    }

    // Optimistic add
    const optimistic: ServerWithHealth = {
      identityPubkey,
      url: trimmedUrl,
      label: newLabel.trim() || null,
      position: servers.length,
      healthStatus: 'checking',
    };
    setServers(prev => [...prev, optimistic]);
    setNewUrl('');
    setNewLabel('');

    try {
      const added = await blossomApi.addServer(identityPubkey, trimmedUrl, newLabel.trim() || null);
      // Update with real data from server
      setServers(prev =>
        prev.map(s => s.url === trimmedUrl ? { ...added, healthStatus: 'checking' } : s)
      );
      // Check health of newly added server
      blossomApi.checkHealth(trimmedUrl).then((result: HealthCheckResult) => {
        setServers(prev =>
          prev.map(s =>
            s.url === result.url
              ? { ...s, healthStatus: result.healthy ? 'healthy' : 'unhealthy' }
              : s
          )
        );
      });
    } catch (error) {
      // Rollback optimistic add
      setServers(prev => prev.filter(s => s.url !== trimmedUrl));
      toaster.create({
        title: 'Failed to add server',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    }
  }, [newUrl, newLabel, servers, identityPubkey]);

  const handleRemove = useCallback(async (url: string) => {
    setConfirmRemoveUrl(null);

    // Optimistic remove
    const previousServers = servers;
    setServers(prev => prev.filter(s => s.url !== url));

    try {
      await blossomApi.removeServer(identityPubkey, url);
    } catch (error) {
      // Rollback
      setServers(previousServers);
      toaster.create({
        title: 'Failed to remove server',
        description: error instanceof Error ? error.message : 'Unknown error',
        type: 'error',
      });
    }
  }, [servers, identityPubkey]);

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  if (loading) {
    return (
      <Box p="4" data-testid="blossom-settings-loading">
        <Text fontSize="sm" color={colors.textSubtle}>Loading blossom servers...</Text>
      </Box>
    );
  }

  return (
    <VStack width="full" gap="4" align="stretch" data-testid="blossom-server-settings">
      {servers.length === 0 ? (
        <Box p="4" textAlign="center" data-testid="blossom-empty-state">
          <Text fontSize="sm" color={colors.textSubtle}>
            No blossom servers configured. Add one to enable media uploads.
          </Text>
        </Box>
      ) : (
        <Box overflowX="auto" borderRadius="md" border="1px" borderColor={colors.border}>
          <Table.Root size="sm">
            <Table.Header bg={colors.surfaceBgSubtle}>
              <Table.Row height="36px">
                <Table.ColumnHeader width="40px" padding="1" fontSize="xs">
                  Status
                </Table.ColumnHeader>
                <Table.ColumnHeader padding="1" fontSize="xs">
                  URL
                </Table.ColumnHeader>
                <Table.ColumnHeader padding="1" fontSize="xs" width="120px">
                  Label
                </Table.ColumnHeader>
                <Table.ColumnHeader width="40px" padding="1" fontSize="xs">
                  Remove
                </Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {servers.map(server => (
                <Table.Row
                  key={server.url}
                  height="36px"
                  _hover={{ bg: colors.surfaceBgSubtle }}
                  data-testid={`blossom-server-row-${server.url}`}
                >
                  <Table.Cell width="40px" padding="1">
                    <HealthDot status={server.healthStatus} />
                  </Table.Cell>
                  <Table.Cell padding="1">
                    <Text fontSize="sm" color={colors.textPrimary} wordBreak="break-all">
                      {server.url}
                    </Text>
                  </Table.Cell>
                  <Table.Cell padding="1" width="120px">
                    <Text fontSize="sm" color={colors.textSubtle}>
                      {server.label || ''}
                    </Text>
                  </Table.Cell>
                  <Table.Cell width="40px" padding="1">
                    {confirmRemoveUrl === server.url ? (
                      <HStack gap="1">
                        <Button
                          size="xs"
                          colorPalette="red"
                          variant="solid"
                          onClick={() => handleRemove(server.url)}
                          data-testid="blossom-confirm-remove"
                        >
                          Remove
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => setConfirmRemoveUrl(null)}
                          data-testid="blossom-cancel-remove"
                        >
                          Cancel
                        </Button>
                      </HStack>
                    ) : (
                      <IconButton
                        size="sm"
                        aria-label="Remove server"
                        onClick={() => setConfirmRemoveUrl(server.url)}
                        variant="ghost"
                        fontSize="lg"
                        data-testid="blossom-remove-button"
                      >
                        −
                      </IconButton>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}

      {/* Add server form */}
      <Box
        borderRadius="md"
        border="1px"
        borderColor={colors.border}
        p="3"
        data-testid="blossom-add-form"
      >
        <VStack gap="2" align="stretch">
          <Text fontSize="xs" fontWeight="bold" color={colors.textSubtle}>
            Add Server
          </Text>
          <HStack gap="2">
            <Input
              size="sm"
              placeholder="https://cdn.example.com"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={handleAddKeyDown}
              data-testid="blossom-url-input"
            />
            <Input
              size="sm"
              placeholder="Label (optional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={handleAddKeyDown}
              width="160px"
              data-testid="blossom-label-input"
            />
            <Button
              size="sm"
              colorPalette="blue"
              onClick={handleAdd}
              data-testid="blossom-add-button"
            >
              Add
            </Button>
          </HStack>
        </VStack>
      </Box>

      {/* Footer summary */}
      <Text fontSize="xs" color={colors.textMuted}>
        {servers.length} server{servers.length !== 1 ? 's' : ''} configured
      </Text>
    </VStack>
  );
}
