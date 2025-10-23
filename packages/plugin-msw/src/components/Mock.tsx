import { URLPath } from '@kubb/core/utils'
import type { OasTypes, Operation } from '@kubb/oas'
import { File, Function, FunctionParams } from '@kubb/react'

type Props = {
  /**
   * Name of the function
   */
  name: string
  typeName: string
  fakerName: string
  baseURL: string | undefined
  operation: Operation
  queryTypeName: string | undefined
}

export function Mock({ baseURL = '', name, typeName, operation, queryTypeName }: Props) {
  const method = operation.method
  const successStatusCodes = operation.getResponseStatusCodes().filter((code) => code.startsWith('2'))
  const statusCode = successStatusCodes.length > 0 ? Number(successStatusCodes[0]) : 200

  const responseObject = operation.getResponseByStatusCode(statusCode) as OasTypes.ResponseObject
  const contentType = Object.keys(responseObject.content || {})?.[0]
  const url = new URLPath(operation.path).toURLPath().replace(/([^/]):/g, '$1\\\\:')

  const headers = [contentType ? `'Content-Type': '${contentType}'` : undefined].filter(Boolean)

  const hasResponseSchema = contentType && responseObject?.content?.[contentType]?.schema !== undefined

  // If no response schema, uses any type but function to avoid overriding callback
  const dataType = hasResponseSchema ? typeName : 'string | number | boolean | null | object'

  let infoType = `Parameters<Parameters<typeof http.${method}>[1]>[0]`

  if (queryTypeName) {
    infoType += ` & { query: ${queryTypeName} }`
  }

  const params = FunctionParams.factory({
    data: {
      type: `${dataType} | ((
        info: ${infoType}
      ) => Response | Promise<Response>)`,
      optional: true,
    },
  })

  let returnData = `return data(info)`

  /** Record for query params. */
  let queryRecord: Record<string, 'single' | 'multiple'> = {}

  if (queryTypeName) {
    const queryParamsSchema = operation.getParameters().filter((p) => p.in === 'query')

    for (const param of queryParamsSchema) {
      const schema = param.schema as OasTypes.SchemaObject
      queryRecord[param.name] = schema?.type === 'array' ? 'multiple' : 'single'
    }

    returnData = 'return data({ ...info, query})'
  }

  // Generates a URL then a record to contain all query params
  const queryParamsGeneration = queryTypeName
    ? `
  const url = new URL(info.request.url)

  const query: Record<keyof ${queryTypeName}, string | string[] | null> = {
    ${Object.entries(queryRecord).map(([key, value]) => `${key}: url.searchParams.${value === 'multiple' ? 'getAll' : 'get'}('${key}')`)}
  }
  `
    : ''
  return (
    <File.Source name={name} isIndexable isExportable>
      <Function name={name} export params={params.toConstructor()}>
        {`return http.${method}('${baseURL}${url.replace(/([^/]):/g, '$1\\\\:')}', function handler(info) {
  if(typeof data === 'function') {
  ${queryParamsGeneration}
    ${returnData}
  }

    return new Response(JSON.stringify(data), {
      status: ${statusCode},
      ${
        headers.length
          ? `  headers: {
        ${headers.join(', \n')}
      },`
          : ''
      }
    })
  })`}
      </Function>
    </File.Source>
  )
}
