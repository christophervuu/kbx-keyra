import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

const templatePath = new URL('../../template.yaml', import.meta.url);
const template = readFileSync(templatePath, 'utf8');

describe('runtime bootstrap template (FS-100 T-05)', () => {
  it('allows sandbox runtime environment for SANDBOX-first vertical slice', () => {
    const envParamBlock = template.match(/EnvironmentName:\n(?:[\s\S]*?)Description: Runtime bootstrap environment name \(FS-082\)\./);
    expect(envParamBlock?.[0]).toContain('AllowedValues:');
    expect(envParamBlock?.[0]).toContain('- sandbox');
    expect(envParamBlock?.[0]).toContain('- dev');
    expect(envParamBlock?.[0]).toContain('- preprod');
    expect(envParamBlock?.[0]).toContain('- prod');
  });

  it('defines explicit least-privilege runtime roles', () => {
    expect(template).toContain('KeyRaDeploymentWriterRole:');
    expect(template).toContain('RoleName: !Sub \'${EnvironmentName}-${ServiceName}-deployment-writer\'');
    expect(template).toContain('KeyRaRuntimeRole:');
    expect(template).toContain('RoleName: !Sub \'${EnvironmentName}-${ServiceName}-runtime\'');
    expect(template).toContain('KeyRaRuntimeInvokeRole:');
    expect(template).toContain('RoleName: !Sub \'${EnvironmentName}-${ServiceName}-runtime-invoke\'');
  });

  it('wires runtime functions to explicit roles instead of broad inline policies', () => {
    const deployBlock = template.match(/RuntimeDeployHandlerFunction:[\s\S]*?Events:\n\s+InternalDeploy:/)?.[0] ?? '';
    expect(deployBlock).toContain('Role: !GetAtt KeyRaDeploymentWriterRole.Arn');
    expect(deployBlock).not.toContain('Policies:');

    const rollbackBlock = template.match(/RuntimeRollbackHandlerFunction:[\s\S]*?Events:\n\s+InternalRollback:/)?.[0] ?? '';
    expect(rollbackBlock).toContain('Role: !GetAtt KeyRaDeploymentWriterRole.Arn');
    expect(rollbackBlock).not.toContain('Policies:');

    const executeBlock = template.match(/RuntimeExecuteFunction:[\s\S]*?Events:\n\s+InternalExecute:/)?.[0] ?? '';
    expect(executeBlock).toContain('Role: !GetAtt KeyRaRuntimeRole.Arn');
    expect(executeBlock).not.toContain('Policies:');

    const statusBlock = template.match(/RuntimeStatusFunction:[\s\S]*?Events:\n\s+InternalHealth:/)?.[0] ?? '';
    expect(statusBlock).toContain('Role: !GetAtt KeyRaRuntimeRole.Arn');
    expect(statusBlock).not.toContain('Policies:');
  });

  it('keeps runtime invoke role scoped to invoke runtime execute function only', () => {
    const invokeRoleBlock = template.match(/KeyRaRuntimeInvokeRole:[\s\S]*?RuntimeDeployHandlerFunction:/)?.[0] ?? '';
    expect(invokeRoleBlock).toContain('- lambda:InvokeFunction');
    expect(invokeRoleBlock).toContain('- !GetAtt RuntimeExecuteFunction.Arn');
    expect(invokeRoleBlock).toContain('function:dev-${ServiceName}-execute');
    expect(invokeRoleBlock).toContain('function:preprod-${ServiceName}-execute');
    expect(invokeRoleBlock).toContain('function:prod-${ServiceName}-execute');
    expect(invokeRoleBlock).toContain('HasRuntimeAccountIdDev');
    expect(invokeRoleBlock).toContain('HasRuntimeAccountIdPreprod');
    expect(invokeRoleBlock).toContain('HasRuntimeAccountIdProd');
    expect(invokeRoleBlock).not.toContain('dynamodb:');
    expect(invokeRoleBlock).not.toContain('s3:');
  });

  it('wires preview function to invoke-only role and parameterized runtime execute arn env config', () => {
    const previewBlock = template.match(/PreviewMappingFunction:[\s\S]*?DeployMappingFunction:/)?.[0] ?? '';
    expect(previewBlock).toContain('Role: !GetAtt KeyRaRuntimeInvokeRole.Arn');
    expect(previewBlock).toContain('RUNTIME_EXECUTE_FUNCTION_ARN_DEV:');
    expect(previewBlock).toContain('RUNTIME_EXECUTE_FUNCTION_ARN_PREPROD:');
    expect(previewBlock).toContain('RUNTIME_EXECUTE_FUNCTION_ARN_PROD:');
    expect(previewBlock).toContain('RuntimeAccountIdDev');
    expect(previewBlock).toContain('RuntimeAccountIdPreprod');
    expect(previewBlock).toContain('RuntimeAccountIdProd');
    expect(previewBlock).toContain('function:dev-${ServiceName}-execute');
    expect(previewBlock).toContain('function:preprod-${ServiceName}-execute');
    expect(previewBlock).toContain('function:prod-${ServiceName}-execute');
    expect(previewBlock).not.toContain('Policies:');
  });

  it('exports new role arns for runtime wiring and verification', () => {
    expect(template).toContain('KeyRaDeploymentWriterRoleArn:');
    expect(template).toContain('Value: !GetAtt KeyRaDeploymentWriterRole.Arn');
    expect(template).toContain('KeyRaRuntimeRoleArn:');
    expect(template).toContain('Value: !GetAtt KeyRaRuntimeRole.Arn');
    expect(template).toContain('KeyRaRuntimeInvokeRoleArn:');
    expect(template).toContain('Value: !GetAtt KeyRaRuntimeInvokeRole.Arn');
  });

  it('defines explicit runtime account id overrides for cross-account and single-account isolation', () => {
    expect(template).toContain('RuntimeAccountIdDev:');
    expect(template).toContain('RuntimeAccountIdPreprod:');
    expect(template).toContain('RuntimeAccountIdProd:');
    expect(template).toContain('HasRuntimeAccountIdDev');
    expect(template).toContain('HasRuntimeAccountIdPreprod');
    expect(template).toContain('HasRuntimeAccountIdProd');
  });

  it('includes mapping revisions routes used by deployment page route parity', () => {
    expect(template).toContain('Path: /mappings/{mappingId}/revisions');
    expect(template).toContain('Path: /mappings/{mappingId}/revisions/{revision}');
  });

  it('includes deploy-context route used by deployment page bootstrap', () => {
    expect(template).toContain('Path: /mappings/{mappingId}/deploy-context');
    expect(template).toContain('Handler: src/lambda/deployment/get-deployment-context.handler');
  });

  it('grants deploy/promote handlers schema metadata read access required by CDM deploy guard', () => {
    const deployBlock = template.match(/DeployMappingFunction:[\s\S]*?PromoteDeploymentFunction:/)?.[0] ?? '';
    expect(deployBlock).toContain('TableName: !Ref SchemaMetadataTable');

    const promoteBlock = template.match(/PromoteDeploymentFunction:[\s\S]*?RollbackDeploymentFunction:/)?.[0] ?? '';
    expect(promoteBlock).toContain('TableName: !Ref SchemaMetadataTable');
  });

  it('enforces role boundaries for runtime stores and artifact access', () => {
    const deploymentWriterBlock = template.match(/KeyRaDeploymentWriterRole:[\s\S]*?KeyRaRuntimeRole:/)?.[0] ?? '';
    expect(deploymentWriterBlock).toContain('RuntimeActiveSnapshotsWrite');
    expect(deploymentWriterBlock).toContain('RuntimeDeploymentHistoryWrite');
    expect(deploymentWriterBlock).toContain('RuntimeArtifactsObjectWrite');
    expect(deploymentWriterBlock).toContain('RuntimeArtifactsBucketList');
    expect(deploymentWriterBlock).toContain('- s3:ListBucket');
    expect(deploymentWriterBlock).not.toContain('lambda:InvokeFunction');

    const runtimeRoleBlock = template.match(/KeyRaRuntimeRole:[\s\S]*?KeyRaRuntimeInvokeRole:/)?.[0] ?? '';
    expect(runtimeRoleBlock).toContain('RuntimeActiveSnapshotsRead');
    expect(runtimeRoleBlock).toContain('RuntimeDeploymentHistoryRead');
    expect(runtimeRoleBlock).toContain('RuntimeArtifactsObjectRead');
    expect(runtimeRoleBlock).not.toContain('dynamodb:PutItem');
    expect(runtimeRoleBlock).not.toContain('dynamodb:UpdateItem');
    expect(runtimeRoleBlock).not.toContain('s3:PutObject');
    expect(runtimeRoleBlock).not.toContain('s3:DeleteObject');
  });

  it('keeps gateway 4xx/5xx responses configured with CORS headers', () => {
    const default4xx = template.match(/KeyraApiGatewayResponseDefault4xx:[\s\S]*?KeyraApiGatewayResponseDefault5xx:/)?.[0] ?? '';
    expect(default4xx).toContain('gatewayresponse.header.Access-Control-Allow-Origin');
    expect(default4xx).toContain('gatewayresponse.header.Access-Control-Allow-Headers');
    expect(default4xx).toContain('gatewayresponse.header.Access-Control-Allow-Methods');

    const default5xx = template.match(/KeyraApiGatewayResponseDefault5xx:[\s\S]*?CreateProjectFunction:/)?.[0] ?? '';
    expect(default5xx).toContain('gatewayresponse.header.Access-Control-Allow-Origin');
    expect(default5xx).toContain('gatewayresponse.header.Access-Control-Allow-Headers');
    expect(default5xx).toContain('gatewayresponse.header.Access-Control-Allow-Methods');
  });
});
