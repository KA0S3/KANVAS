import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportModal } from '../components/ExportModal';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    }
  }
}));

// Mock permission service
vi.mock('@/services/permissionService', () => ({
  permissionService: {
    canUserPerform: vi.fn(),
    clearCache: vi.fn()
  }
}));

describe('ExportModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render export options with clear descriptions', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={mockOnClose}
        projectId="test-project"
        projectName="Test Project"
      />
    );

    expect(screen.getByText('Export Project')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();

    // Check JSON export section
    expect(screen.getByText('JSON Export')).toBeInTheDocument();
    expect(screen.getByText('Structure only (no images)')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();

    // Check ZIP export section
    expect(screen.getByText('ZIP Export')).toBeInTheDocument();
    expect(screen.getByText('Full export — project + images (Pro+ or paid addon)')).toBeInTheDocument();
    expect(screen.getByText('Pro+')).toBeInTheDocument();
  });

  it('should show upgrade prompt when ZIP export is clicked without permission', async () => {
    const { permissionService } = await import('@/services/permissionService');

    // Mock user has no permission for ZIP export
    vi.mocked(permissionService.canUserPerform).mockResolvedValue({
      allowed: false,
      reason: 'ZIP export requires Pro plan'
    });

    render(
      <ExportModal
        isOpen={true}
        onClose={mockOnClose}
        projectId="test-project"
        projectName="Test Project"
      />
    );

    // Find all buttons and click the one that contains "Upgrade" text
    const buttons = screen.getAllByRole('button');
    const upgradeButton = buttons.find(button => 
      button.textContent?.includes('Upgrade')
    );
    
    expect(upgradeButton).toBeInTheDocument();
    if (upgradeButton) {
      fireEvent.click(upgradeButton);
    }

    await waitFor(() => {
      expect(permissionService.canUserPerform).toHaveBeenCalledWith('export_zip');
    });
  });

  it('should allow ZIP export when user has permission', async () => {
    const { supabase } = await import('@/lib/supabase');
    const { permissionService } = await import('@/services/permissionService');

    // Mock user has permission for ZIP export
    vi.mocked(permissionService.canUserPerform).mockResolvedValue({
      allowed: true
    });

    // Mock successful auth session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString()
          }
        }
      },
      error: null
    });

    // Mock successful fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    render(
      <ExportModal
        isOpen={true}
        onClose={mockOnClose}
        projectId="test-project"
        projectName="Test Project"
      />
    );

    // Find all buttons and click the one that contains "Export as ZIP" text
    const buttons = screen.getAllByRole('button');
    const zipButton = buttons.find(button => 
      button.textContent?.includes('Export as ZIP')
    );
    
    expect(zipButton).toBeInTheDocument();
    if (zipButton) {
      fireEvent.click(zipButton);
    }

    await waitFor(() => {
      expect(permissionService.canUserPerform).toHaveBeenCalledWith('export_zip');
    });
  });

  it('should handle JSON export without permission check', async () => {
    const { supabase } = await import('@/lib/supabase');

    // Mock successful auth session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: new Date().toISOString()
          }
        }
      },
      error: null
    });

    // Mock successful fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    render(
      <ExportModal
        isOpen={true}
        onClose={mockOnClose}
        projectId="test-project"
        projectName="Test Project"
      />
    );

    // Find all buttons and click the one that contains "Export as JSON" text
    const buttons = screen.getAllByRole('button');
    const jsonButton = buttons.find(button => 
      button.textContent?.includes('Export as JSON')
    );
    
    expect(jsonButton).toBeInTheDocument();
    if (jsonButton) {
      fireEvent.click(jsonButton);
    }

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/exportProject'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"include_assets":false')
        })
      );
    });
  });

  it('should close modal when cancel is clicked', () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={mockOnClose}
        projectId="test-project"
        projectName="Test Project"
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should not render when isOpen is false', () => {
    render(
      <ExportModal
        isOpen={false}
        onClose={mockOnClose}
        projectId="test-project"
        projectName="Test Project"
      />
    );

    expect(screen.queryByText('Export Project')).not.toBeInTheDocument();
  });
});
