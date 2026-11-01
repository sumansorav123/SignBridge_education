import api from './client'
import { createResourceApi } from './resources'

export const resources = createResourceApi(api)
