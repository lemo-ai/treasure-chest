import type { LlmToolSpec } from '@shared'

export const codingToolSpecs: LlmToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file inside the harness workspace sandbox.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path under workspace sandbox' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or overwrite a UTF-8 text file in the workspace sandbox.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'str_replace_file',
      description:
        'Replace exactly one unique occurrence of old_string with new_string in a sandbox file (Codex/str_replace_editor style).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories inside the workspace sandbox.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative directory path (default ".")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search file and directory names under a sandbox path (supports * wildcards).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative root directory (default ".")' },
          pattern: { type: 'string', description: 'Name substring or glob, e.g. *.ts or config' },
          limit: { type: 'number', description: 'Max results (default 50, max 200)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_content',
      description:
        'Search file contents under a sandbox path for a regex or literal pattern. Returns matching lines with path:line.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative root directory or file (default ".")' },
          pattern: { type: 'string', description: 'Regex or literal substring to find' },
          glob: { type: 'string', description: 'Optional filename glob filter, e.g. *.ts' },
          case_insensitive: { type: 'boolean', description: 'Case-insensitive match' },
          limit: { type: 'number', description: 'Max hits (default 50, max 200)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description:
        'Apply a unified diff patch to one or more sandbox files. Patch must include --- / +++ / @@ hunk headers.',
      parameters: {
        type: 'object',
        properties: {
          patch: { type: 'string', description: 'Unified diff text' },
        },
        required: ['patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show git working tree status (porcelain) in the sandbox repo.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Relative repo directory (default ".")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show git diff for the sandbox repo, optionally scoped to a path.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Relative repo directory (default ".")' },
          path: { type: 'string', description: 'Optional file path filter' },
          staged: { type: 'boolean', description: 'Show staged (--cached) diff' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stage optional paths and create a git commit with the given message.',
      parameters: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: 'Relative repo directory (default ".")' },
          message: { type: 'string', description: 'Commit message' },
          paths: { type: 'string', description: 'Optional space-separated paths to git add before commit' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description:
        'Run a shell command in the workspace sandbox directory. Use for build/test/scripts; destructive commands require user approval.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command string' },
          cwd: { type: 'string', description: 'Optional relative working directory (default ".")' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell_background',
      description:
        'Start a long-running shell command in the background. Returns jobId immediately; poll with get_job_status.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command string' },
          cwd: { type: 'string', description: 'Optional relative working directory (default ".")' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_job_status',
      description: 'Get stdout/stderr/exit status for a background shell job started via run_shell_background.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
        },
        required: ['jobId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'kill_job',
      description: 'Send SIGTERM to a running background shell job.',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
        },
        required: ['jobId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_jobs',
      description: 'List background shell jobs for the current session.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Optional session filter' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_diagnostics',
      description:
        'Run TypeScript/JavaScript/JSON diagnostics on a sandbox file or the whole workspace (max 120 files).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Optional relative file path; omit to scan workspace' },
        },
      },
    },
  },
]

export const harnessAgentToolSpecs: LlmToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'set_goal',
      description: 'Create or replace the active objective for this session (planning / multi-step tasks).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short goal title' },
          detail: { type: 'string', description: 'Optional elaboration' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_goal',
      description: 'Update a session goal status or detail.',
      parameters: {
        type: 'object',
        properties: {
          goalId: { type: 'string' },
          status: { type: 'string', enum: ['active', 'done', 'cancelled'] },
          detail: { type: 'string' },
        },
        required: ['goalId', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_goals',
      description: 'List goals for the current session.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spawn_subagent',
      description:
        'Delegate a focused sub-task to a child agent. The child runs in an isolated session and returns a concise result.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Instructions for the child agent' },
          agentId: {
            type: 'string',
            description: 'Optional agent persona id (fortune/stocks/direct/custom_*)',
          },
        },
        required: ['task'],
      },
    },
  },
]
